import { expect, test } from "bun:test";
import { readSse } from "./readSse.ts";

test("SSE frames survive byte boundaries, split CRLF, and multiline payloads", async () => {
	const bytes = new TextEncoder().encode(
		': heartbeat\r\nid: one\r\nevent: sessions.status\r\ndata: {\r\ndata: "title":"café"}\r\n\r\ndata: next\n\n',
	);
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
			controller.close();
		},
	});
	const frames = [];
	for await (const frame of readSse(stream)) frames.push(frame);
	expect(frames).toEqual([
		{ id: "one", event: "sessions.status", data: '{\n"title":"café"}' },
		{ id: "one", event: "message", data: "next" },
	]);
});
