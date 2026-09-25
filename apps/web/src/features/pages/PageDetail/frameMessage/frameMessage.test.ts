import { expect, test } from "bun:test";
import { readFrameMessage } from "./frameMessage";

const source = {} as Window;
const message = (data: unknown, from: Window | null = source) =>
	readFrameMessage({ source: from, data }, source, "nonce");
test("accepts the mounted frame and its nonce", () => {
	expect(message({ type: "page-scroll", nonce: "nonce", x: 2, y: 320 })).toEqual({
		type: "page-scroll",
		nonce: "nonce",
		x: 2,
		y: 320,
	});
});
test("rejects a foreign frame and a foreign nonce", () => {
	expect(message({ type: "page-ready", nonce: "nonce" }, {} as Window)).toBeNull();
	expect(message({ type: "page-ready", nonce: "other" })).toBeNull();
});
test("refuses mutations and invalid coordinates even from the right frame", () => {
	for (const data of [
		{ type: "page-delete", nonce: "nonce" },
		{ type: "page-scroll", nonce: "nonce", x: 0, y: Infinity },
		{ type: "page-scroll", nonce: "nonce", x: 0, y: -1 },
		{ type: "page-ready", nonce: "nonce", action: "delete" },
		null,
	])
		expect(message(data)).toBeNull();
});
