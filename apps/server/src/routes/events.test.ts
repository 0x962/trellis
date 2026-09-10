import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ReadyPayloadSchema, TicketEventPayloadSchema } from "@trellis/api";
import { ulid } from "ulid";
import { commentEvent, graphqlReply, linkPr, seedPr, ticketEvent } from "../../test/fixtures";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { ghStub } from "../../test/helpers/gh-stub.ts";
import { dataOf, nextEvent, openSse, type SseReader } from "../../test/helpers/sse.ts";
import type { BusEntry } from "../events/bus.ts";
import { createGhRunner } from "../gh/run.ts";

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

	test("the project filter passes the comment and attachment events of its project only", async () => {
		const other = await t.seedProject("OPS", "Operations");
		await t.createTicket({ project: "CDE", title: "Mine" });
		await t.createTicket({ project: "OPS", title: "Other" });
		const stream = await open(`?project=${other.key}&types=comment.*,attachment.*`);
		await nextEvent(stream);

		await t.api("/api/tickets/CDE-1/comments", { method: "POST", body: { body: "Not for OPS" } });
		await t.api("/api/tickets/OPS-1/comments", { method: "POST", body: { body: "For OPS" } });
		const form = new FormData();
		form.set("file", new File([new TextEncoder().encode("notes")], "notes.txt", { type: "text/plain" }));
		await t.api("/api/tickets/OPS-1/attachments", { method: "POST", raw: form });
		const comment = await nextEvent(stream);
		const attachment = await nextEvent(stream);

		expect(comment.event).toBe("comment.created");
		expect(attachment.event).toBe("attachment.created");
		const opsTicket = (await t.api("/api/tickets/OPS-1")).body.id;
		expect(dataOf<{ ticketId: string }>(comment).ticketId).toBe(opsTicket);
		expect(await stream.idle(100)).toBe(true);
	});

	test("the project filter passes the pull request events of its tickets", async () => {
		const handle = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-events-")), {
			"api graphql": graphqlReply([{ number: 12, url: "https://github.com/acme/web/pull/12" }]),
		});
		try {
			await t.close();
			t = await createTestApp({ db: h, gh: createGhRunner() });
			const other = await t.seedProject("OPS", "Operations");
			await t.createTicket({ project: "OPS", title: "Other" });
			const stream = await open(`?project=${other.key}&types=pr.*`);
			await nextEvent(stream);

			const url = "https://github.com/acme/web/pull/12";
			await t.api("/api/tickets/OPS-1/prs", { method: "POST", body: { url } });
			const message = await nextEvent(stream);

			expect(message.event).toBe("pr.linked");
		} finally {
			handle.restore();
		}
	});

	test("a ticket stream receives the pr.unlinked of its ticket while another ticket keeps the link", async () => {
		const first = await t.createTicket({ project: "CDE", title: "One" });
		const second = await t.createTicket({ project: "CDE", title: "Two" });
		const pr = await seedPr(t.db, { number: 12 });
		await linkPr(t.db, first.id, pr);
		await linkPr(t.db, second.id, pr);
		const watching = await open("?ticket=CDE-1");
		const other = await open("?ticket=CDE-2");
		await nextEvent(watching);
		await nextEvent(other);

		const response = await t.api(`/api/tickets/CDE-1/prs/${pr}`, { method: "DELETE" });
		const seen = await nextEvent(watching);
		const seenByOther = await nextEvent(other);

		expect(response.status).toBe(200);
		expect(seen.event).toBe("pr.unlinked");
		expect(dataOf<{ ticketIds: string[] }>(seen).ticketIds).toContain(first.id);
		expect(seenByOther.event).toBe("pr.unlinked");
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

	test("a ping outside whole seconds from 5 to 120 answers INPUT_VALIDATION_FAILED", async () => {
		for (const ping of ["abc", "0", "4", "121", "5.5", "", "-10"]) {
			const response = await t.app.request(`http://trellis.test/api/events?ping=${ping}`);
			if (response.status !== 400) await response.body?.cancel();

			expect(response.status, ping).toBe(400);
			expect((await response.json()).code, ping).toBe("INPUT_VALIDATION_FAILED");
		}
	});

	test("a ping of 5 and a ping of 120 open the stream", async () => {
		for (const ping of ["5", "120"]) {
			const stream = await open(`?ping=${ping}`);

			expect(stream.response.status, ping).toBe(200);
			expect((await nextEvent(stream)).event).toBe("ready");
		}
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
