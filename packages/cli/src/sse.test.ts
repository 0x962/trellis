import { describe, expect, test } from "bun:test";
import { readSse } from "./sse.ts";

// `readSse(stream)` takes the byte stream of a `text/event-stream` body and
// yields `{ id, event, data }` per frame. An id line sets the id for every
// later frame that has none.
const streamOf = (...chunks: string[]) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
			controller.close();
		},
	});

const collect = async (stream: ReadableStream<Uint8Array>) => {
	const events = [];
	for await (const event of readSse(stream)) events.push(event);
	return events;
};

describe("readSse", () => {
	// CLI-57
	test("readSse parses id, event, and data", async () => {
		const events = await collect(streamOf('id: A.1\nevent: ticket.updated\ndata: {"a":1}\n\n'));
		expect(events).toEqual([{ id: "A.1", event: "ticket.updated", data: '{"a":1}' }]);
	});

	// CLI-58
	test("readSse joins multi-line data with newlines", async () => {
		const events = await collect(streamOf("id: A.2\nevent: ready\ndata: one\ndata: two\ndata: three\n\n"));
		expect(events).toHaveLength(1);
		expect(events[0]!.data).toBe("one\ntwo\nthree");
	});

	// CLI-59
	test("readSse ignores comments and accepts CRLF", async () => {
		const events = await collect(streamOf(": ping\n\n", "id: A.3\r\nevent: ready\r\ndata: x\r\n\r\n"));
		expect(events).toEqual([{ id: "A.3", event: "ready", data: "x" }]);
	});

	// CLI-60
	test("readSse reassembles a frame split across chunks", async () => {
		const events = await collect(streamOf('id: A.4\nevent: ticket.updated\ndata: {"ident', 'ifier":"CDE-42"}\n\n'));
		expect(events).toEqual([{ id: "A.4", event: "ticket.updated", data: '{"identifier":"CDE-42"}' }]);
	});

	// CLI-61
	test("readSse carries the last event id forward", async () => {
		const events = await collect(streamOf("id: A.5\nevent: ready\ndata: x\n\n", "event: ping\ndata: y\n\n"));
		expect(events).toHaveLength(2);
		expect(events[1]).toEqual({ id: "A.5", event: "ping", data: "y" });
	});
});
