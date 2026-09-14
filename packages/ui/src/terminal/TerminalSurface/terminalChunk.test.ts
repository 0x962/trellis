import { expect, test } from "bun:test";
import { terminalChunk } from "./terminalChunk.ts";

test("terminal frames preserve split UTF-8 bytes and use byte offsets", () => {
	const bytes = Buffer.from("work ✓");
	const first = terminalChunk(
		{ data: bytes.subarray(0, 6).toString("base64"), startOffset: 0, nextOffset: 6, truncated: false },
		0,
	);
	const second = terminalChunk(
		{ data: bytes.subarray(6).toString("base64"), startOffset: 6, nextOffset: bytes.length, truncated: false },
		first.nextOffset,
	);
	expect(Buffer.concat([first.bytes, second.bytes]).toString()).toBe("work ✓");
	expect(second.nextOffset).toBe(bytes.length);
	expect(second.reset).toBe(false);
});

test("a missing retained prefix resets the screen and exposes the gap", () => {
	const chunk = terminalChunk(
		{ data: Buffer.from("tail").toString("base64"), startOffset: 90, nextOffset: 94, truncated: true },
		10,
	);
	expect(chunk.reset).toBe(true);
	expect(chunk.nextOffset).toBe(94);
});
