import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { EVENT_BODY_LIMIT, ReadyPayloadSchema, TicketEventPayloadSchema } from "@trellis/api";
import { ulid } from "ulid";
import { commentEvent, ticketEvent } from "../../test/fixtures";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { dataOf, nextEvent, openSse, type SseReader } from "../../test/helpers/sse.ts";
import type { BusEntry } from "../events/bus.ts";

// GET /api/events is the SSE stream. On connect it replays from `since` or
// `Last-Event-ID`, or sends `reset` when it cannot, then `ready`. Every bus
// event that passes the type and scope filters follows. An idle stream
// carries a `: ping` comment every 15 s, and `bye` ends it on shutdown.

let h: TestDb;
let t: TestApp;
const streams: SseReader[] = [];
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	for (const stream of streams.splice(0)) await stream.close();
	await h.reset();
	t = await createTestApp({ db: h });
	await t.seedProject("CDE");
});
afterAll(async () => {
	for (const stream of streams.splice(0)) await stream.close();
	await h.close();
});

const open = async (query = "", headers: Record<string, string> = {}) => {
	const stream = await openSse(t.app, `/api/events${query}`, headers);
	streams.push(stream);
	return stream;
};

// Three ticket creates, and the bus entries they produced.
const threeEvents = async () => {
	const entries: BusEntry[] = [];
	const stop = t.bus.subscribe((entry) => void entries.push(entry));
	for (const title of ["One", "Two", "Three"]) await t.createTicket({ project: "CDE", title });
	stop();
	expect(entries).toHaveLength(3);
	return entries;
};

describe("connect", () => {
	test("the stream opens with a ready event", async () => {
		const stream = await open();

		const ready = await nextEvent(stream);

		expect(stream.response.status).toBe(200);
		expect(stream.response.headers.get("content-type")).toContain("text/event-stream");
		expect(ready.event).toBe("ready");
		const payload = ReadyPayloadSchema.parse(dataOf(ready));
		expect(payload.bootId).toBe(t.bootId);
		expect(payload.serverVersion).toBe(t.runtime.version);
		expect(payload.apiVersion).toMatch(/\S+/);
	});

	test("a mutation reaches the stream with a bootId dot seq id", async () => {
		const stream = await open();
		await nextEvent(stream);

		const ticket = await t.createTicket({ project: "CDE", title: "Live" });
		const message = await nextEvent(stream);

		expect(message.event).toBe("ticket.created");
		expect(message.id).toMatch(new RegExp(`^${t.bootId}\\.\\d+$`));
		const payload = TicketEventPayloadSchema.parse(dataOf(message));
		expect(payload.summary.id).toBe(ticket.id);
		expect(payload.summary.identifier).toBe("CDE-1");
	});

	// `trellis watch` prints the frame id, and an agent passes it to
	// `--since`. So `ready` carries the newest event id as its frame id, and
	// a replay from that id starts at the next event.
	test("ready carries the newest event id as its frame id", async () => {
		const entries = await threeEvents();
		const stream = await open();

		const ready = await nextEvent(stream);

		expect(ready.event).toBe("ready");
		expect(ready.id).toBe(entries[2]!.id);
		const ticket = await t.createTicket({ project: "CDE", title: "After ready" });
		const replay = await open(`?since=${ready.id}`);
		const next = await nextEvent(replay);
		expect(next.event).toBe("ticket.created");
		expect(TicketEventPayloadSchema.parse(dataOf(next)).summary.id).toBe(ticket.id);
	});

	test("the events route needs no actor header", async () => {
		const stream = await open();

		expect(stream.response.status).toBe(200);
		expect((await nextEvent(stream)).event).toBe("ready");
	});

	test("a malformed since answers INPUT_VALIDATION_FAILED", async () => {
		const response = await t.api("/api/events?since=not-an-id", { actor: null });

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("INPUT_VALIDATION_FAILED");
	});
});

describe("replay and reset", () => {
	test("since replays the events after the given id", async () => {
		const entries = await threeEvents();

		const stream = await open(`?since=${entries[0]!.id}`);

		const second = await nextEvent(stream);
		const third = await nextEvent(stream);
		const ready = await nextEvent(stream);
		expect([second.id, third.id]).toEqual([entries[1]!.id, entries[2]!.id]);
		expect(ready.event).toBe("ready");
		expect(dataOf(ready).id).toBe(entries[2]!.id);
	});

	test("Last-Event-ID wins over the since parameter", async () => {
		const entries = await threeEvents();

		const stream = await open(`?since=${entries[2]!.id}`, { "last-event-id": entries[0]!.id });

		const second = await nextEvent(stream);
		const third = await nextEvent(stream);
		expect([second.id, third.id]).toEqual([entries[1]!.id, entries[2]!.id]);
		expect((await nextEvent(stream)).event).toBe("ready");
	});

	test("an id from another boot answers reset restart", async () => {
		await threeEvents();

		const stream = await open(`?since=${ulid()}.1`);

		const reset = await nextEvent(stream);
		expect(reset.event).toBe("reset");
		expect(dataOf(reset)).toEqual({ reason: "restart" });
		expect((await nextEvent(stream)).event).toBe("ready");
	});

	test("an id below the ring floor answers reset gap", async () => {
		const first = t.bus.emit(ticketEvent("ticket.updated"));
		for (let i = 0; i < 1001; i += 1) t.bus.emit(ticketEvent("ticket.updated"));

		const stream = await open(`?since=${first.id}`);

		const reset = await nextEvent(stream);
		expect(reset.event).toBe("reset");
		expect(dataOf(reset)).toEqual({ reason: "gap" });
		expect((await nextEvent(stream)).event).toBe("ready");
	});
});

describe("filters", () => {
	test("the types filter passes a prefix wildcard and an exact name", async () => {
		const stream = await open("?types=ticket.*,pr.updated");
		await nextEvent(stream);

		t.bus.emit(commentEvent("comment.created"));
		t.bus.emit(ticketEvent("ticket.updated"));
		const message = await nextEvent(stream);

		expect(message.event).toBe("ticket.updated");
		expect(await stream.idle(100)).toBe(true);
	});

	test("the project filter scopes the stream to one project", async () => {
		const other = await t.seedProject("OPS", "Operations");
		await t.createTicket({ project: "OPS", title: "Other" });
		await t.createTicket({ project: "CDE", title: "Mine" });
		const stream = await open(`?project=${other.key}`);
		await nextEvent(stream);

		await t.api("/api/tickets/CDE-1", { method: "PATCH", body: { title: "Mine, renamed" } });
		await t.api("/api/tickets/OPS-1", { method: "PATCH", body: { title: "Other, renamed" } });
		const message = await nextEvent(stream);

		expect(message.event).toBe("ticket.updated");
		expect(dataOf<{ summary: { identifier: string } }>(message).summary.identifier).toBe("OPS-1");
		expect(await stream.idle(100)).toBe(true);
	});

	test("the ticket filter scopes the stream to one ticket", async () => {
		await t.createTicket({ project: "CDE", title: "One" });
		await t.createTicket({ project: "CDE", title: "Two" });
		const stream = await open("?ticket=CDE-1");
		await nextEvent(stream);

		await t.api("/api/tickets/CDE-2", { method: "PATCH", body: { priority: "high" } });
		await t.api("/api/tickets/CDE-1", { method: "PATCH", body: { priority: "low" } });
		const message = await nextEvent(stream);

		expect(dataOf<{ summary: { identifier: string } }>(message).summary.identifier).toBe("CDE-1");
		expect(await stream.idle(100)).toBe(true);
	});
});

describe("ping and bye", () => {
	test("an idle stream pings every 15 seconds", async () => {
		const stream = await open();
		await nextEvent(stream);

		t.clock.advance(15_000);
		const ping = await stream.next();

		expect(ping.comment).toBe("ping");
		expect(ping.event).toBeUndefined();
	});

	test("the ping parameter sets the idle interval", async () => {
		const stream = await open("?ping=25");
		await nextEvent(stream);

		t.clock.advance(20_000);
		expect(await stream.idle(100)).toBe(true);
		t.clock.advance(5_000);
		const ping = await stream.next();

		expect(ping.comment).toBe("ping");
	});

	test("shutdown sends bye and closes the stream", async () => {
		const stream = await open();
		await nextEvent(stream);

		await t.bye("shutdown");
		const bye = await nextEvent(stream);

		expect(bye.event).toBe("bye");
		expect(dataOf(bye)).toEqual({ reason: "shutdown" });
		expect(await stream.closed()).toBe(true);
	});
});

// TRL-9. An agent waits for the answer to its question with
// `trellis watch --ticket CDE-1`, which reads this stream. The frame carries
// the answer, so the agent reads it and makes no second call.
describe("content", () => {
	test("a new comment reaches the stream with the ticket, the author, and the text", async () => {
		const ticket = await t.createTicket({ project: "CDE", title: "Dark mode" });
		const stream = await open();
		await nextEvent(stream);

		await t.api(`/api/tickets/${ticket.identifier}/comments`, {
			method: "POST",
			body: { body: "Use the tokens." },
			actor: "human:navid",
		});
		const message = await nextEvent(stream);

		expect(message.event).toBe("comment.created");
		expect(dataOf(message)).toMatchObject({
			ticketId: ticket.id,
			ticketIdentifier: "CDE-1",
			ticketTitle: "Dark mode",
			actor: { name: "navid", kind: "human" },
			body: "Use the tokens.",
			bodyTruncated: false,
		});
	});

	test("a body above the limit reaches the stream cut, and the frame says so", async () => {
		const ticket = await t.createTicket({ project: "CDE", title: "Dark mode" });
		const stream = await open();
		await nextEvent(stream);

		await t.api(`/api/tickets/${ticket.identifier}/comments`, {
			method: "POST",
			body: { body: "x".repeat(EVENT_BODY_LIMIT + 40) },
			actor: "human:navid",
		});
		const message = await nextEvent(stream);

		const data = dataOf(message) as { body: string; bodyTruncated: boolean };
		expect(data.body).toBe("x".repeat(EVENT_BODY_LIMIT));
		expect(data.bodyTruncated).toBe(true);
	});
});
