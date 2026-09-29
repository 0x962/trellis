import { expect, test } from "bun:test";
import { decodeTerminalFrame, encodeTerminalFrame, TerminalFrameDecoder } from "./terminalWire";

test("decodes a complete input above the former frame limits from partial bytes", () => {
	const data = Buffer.concat([Buffer.alloc(8 * 1024 * 1024, 120), Buffer.from("文🙂")]);
	const encoded = encodeTerminalFrame({ type: "input", data, userInput: true });
	const decoder = new TerminalFrameDecoder();
	const frames = [
		...decoder.push(encoded.subarray(0, 2)),
		...decoder.push(encoded.subarray(2, 7)),
		...decoder.push(encoded.subarray(7)),
	];

	expect(frames).toHaveLength(1);
	expect(frames[0]).toEqual({ type: "input", data, userInput: true });
	expect(decoder.incomplete).toBe(false);
});

test("keeps malformed terminal frames invalid", () => {
	const zeroLength = Buffer.alloc(4);
	expect(() => [...new TerminalFrameDecoder().push(zeroLength)]).toThrow("Invalid terminal frame length");
	expect(() => decodeTerminalFrame(Buffer.from([1, 2]))).toThrow("Invalid terminal input frame");
	expect(() => decodeTerminalFrame(Buffer.from([6, 1]))).toThrow("Invalid terminal acknowledgement frame");
	expect(() => decodeTerminalFrame(Buffer.from([255]))).toThrow("Unknown terminal frame type");
});
