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

test("replayed terminal bytes keep the rendered offset and append only new bytes", () => {
	const frame = { data: btoa("abcdef"), startOffset: 10, nextOffset: 16, truncated: false };
	expect(terminalChunk(frame, 13)).toEqual({ bytes: new TextEncoder().encode("def"), reset: false, nextOffset: 16 });
	expect(terminalChunk(frame, 18)).toEqual({ bytes: new Uint8Array(), reset: false, nextOffset: 18 });
});

test("binary terminal frames trim replay bytes without a base64 conversion", () => {
	const data = new Uint8Array([0xe2, 0x9c, 0x93]);
	const chunk = terminalChunk({ data, startOffset: 4, nextOffset: 7, truncated: false }, 5);
	expect(chunk.bytes).toEqual(new Uint8Array([0x9c, 0x93]));
	expect(chunk.bytes.buffer).toBe(data.buffer);
});
