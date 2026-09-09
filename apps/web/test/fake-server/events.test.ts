import { describe, expect, test } from "bun:test";
import { EventSchema, formatEventId, parseEventId, ReadyPayloadSchema } from "@trellis/api";
import { createFakeServer } from "./index";
import { openEvents, parseData } from "./sse";

const otherBoot = "01J8Z6X4Q3M2K1H0G9F8E7D6B1";

describe("fake server events", () => {
	// WS-133
	test("the stream opens with ready carrying the boot id", async () => {
		const server = createFakeServer();
		const stream = await openEvents(server.app);
		expect(stream.response.status).toBe(200);
		expect(stream.response.headers.get("content-type")).toMatch(/^text\/event-stream/);
		const ready = await stream.next();
		expect(ready!.event).toBe("ready");
		const { bootId, seq } = parseEventId(ready!.id!);
		expect(bootId).toBe(server.bootId);
		const data = ReadyPayloadSchema.parse(parseData(ready));
		expect(data.bootId).toBe(server.bootId);
		expect(data.id).toBe(formatEventId({ bootId, seq }));
		stream.close();
	});

	// WS-134. The ping keeps a proxy from closing an idle stream.
	test("ping comments arrive on the configured interval", async () => {
		const server = createFakeServer({ pingMs: 20 });
		const stream = await openEvents(server.app);
		await stream.next();
		const started = Date.now();
		const frame = await stream.next();
		expect(frame!.comment).toBe("ping");
		expect(frame!.event).toBeUndefined();
		expect(Date.now() - started).toBeLessThan(500);
		stream.close();
	});

	// WS-135
	test("every change is an event with an increasing sequence", async () => {
		const server = createFakeServer();
		const stream = await openEvents(server.app);
		const ready = await stream.nextEvent();
		const readySeq = parseEventId(ready!.id!).seq;
		const created = await server.client.tickets.create({ project: "MRG", title: "Streamed" });
		const frame = await stream.nextEvent();
		expect(frame!.event).toBe("ticket.created");
		expect(parseEventId(frame!.id!)).toEqual({ bootId: server.bootId, seq: readySeq + 1 });
		const event = EventSchema.parse({ type: frame!.event, ...parseData<object>(frame) });
		if (event.type !== "ticket.created") throw new Error("expected ticket.created");
		expect(event.summary.id).toBe(created.id);
		await server.client.tickets.update({ ticket: created.identifier, priority: "high" });
		const second = await stream.nextEvent();
		expect(parseEventId(second!.id!).seq).toBe(readySeq + 2);
		stream.close();
	});

	// WS-136. The header is the browser's own resume signal, so it wins
	// over the query parameter.
	test("Last-Event-ID replays the gap and wins over since", async () => {
		const server = createFakeServer();
		const first = await openEvents(server.app);
		const ready = await first.nextEvent();
		const base = parseEventId(ready!.id!).seq;
		await server.client.tickets.update({ ticket: "MRG-3", priority: "high" });
		await server.client.tickets.update({ ticket: "MRG-3", priority: "low" });
		await first.nextEvent();
		const last = await first.nextEvent();
		expect(parseEventId(last!.id!).seq).toBe(base + 2);
		first.close();
		for (const title of ["one", "two", "three"]) {
			await server.client.tickets.create({ project: "MRG", title });
		}
		const resumed = await openEvents(server.app, "/api/events", { headers: { "last-event-id": last!.id! } });
		const replayed = [await resumed.nextEvent(), await resumed.nextEvent(), await resumed.nextEvent()];
		expect(replayed.map((frame) => frame!.event)).toEqual(["ticket.created", "ticket.created", "ticket.created"]);
		expect(replayed.map((frame) => parseEventId(frame!.id!).seq)).toEqual([base + 3, base + 4, base + 5]);
		const readyAgain = await resumed.nextEvent();
		expect(readyAgain!.event).toBe("ready");
		expect(parseEventId(readyAgain!.id!).seq).toBe(base + 5);
		resumed.close();
		const since = formatEventId({ bootId: server.bootId, seq: base + 4 });
		const both = await openEvents(server.app, `/api/events?since=${since}`, {
			headers: { "last-event-id": last!.id! },
		});
		const firstReplayed = await both.nextEvent();
		expect(parseEventId(firstReplayed!.id!).seq).toBe(base + 3);
		both.close();
		const sinceOnly = await openEvents(server.app, `/api/events?since=${since}`);
		const onlyOne = await sinceOnly.nextEvent();
		expect(parseEventId(onlyOne!.id!).seq).toBe(base + 5);
		expect((await sinceOnly.nextEvent())!.event).toBe("ready");
		sinceOnly.close();
	});

	// WS-137
	test("an id from another boot gets reset then ready", async () => {
		const server = createFakeServer();
		const stream = await openEvents(server.app, "/api/events", { headers: { "last-event-id": `${otherBoot}.9` } });
		const reset = await stream.nextEvent();
		expect(reset!.event).toBe("reset");
		expect(parseData<object>(reset)).toEqual({ reason: "restart" });
		const ready = await stream.nextEvent();
		expect(ready!.event).toBe("ready");
		stream.close();
	});

	// WS-138
	test("types and scope filters drop events outside them", async () => {
		const server = createFakeServer();
		const typed = await openEvents(server.app, "/api/events?types=ticket.*");
		await typed.nextEvent();
		await server.client.projects.update({ project: "MRG", name: "Margin" });
		await server.client.tickets.update({ ticket: "MRG-3", priority: "high" });
		const onlyTicket = await typed.nextEvent();
		expect(onlyTicket!.event).toBe("ticket.updated");
		typed.close();

		const scoped = await openEvents(server.app, "/api/events?project=CDE");
		await scoped.nextEvent();
		await server.client.tickets.update({ ticket: "TRL-4", priority: "high" });
		await server.client.tickets.update({ ticket: "CDE-44", priority: "high" });
		const cde = await scoped.nextEvent();
		expect(cde!.event).toBe("ticket.updated");
		expect(parseData<{ summary: { identifier: string } }>(cde).summary.identifier).toBe("CDE-44");
		scoped.close();

		const one = await openEvents(server.app, "/api/events?ticket=CDE-42");
		await one.nextEvent();
		await server.client.tickets.update({ ticket: "CDE-44", priority: "low" });
		await server.client.tickets.update({ ticket: "CDE-42", priority: "urgent" });
		const only42 = await one.nextEvent();
		expect(parseData<{ summary: { identifier: string } }>(only42).summary.identifier).toBe("CDE-42");
		one.close();
	});

	// WS-139
	test("shutdown sends bye and closes the stream", async () => {
		const server = createFakeServer();
		const stream = await openEvents(server.app);
		await stream.nextEvent();
		await server.shutdown();
		const bye = await stream.nextEvent();
		expect(bye!.event).toBe("bye");
		expect(parseData<object>(bye)).toEqual({ reason: "shutdown" });
		expect(await stream.next()).toBeNull();
	});
});
