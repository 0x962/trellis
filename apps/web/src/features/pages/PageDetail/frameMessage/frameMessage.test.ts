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
test("accepts strict comment anchors and bounded pin positions", () => {
	expect(
		message({
			type: "page-comment-anchor",
			nonce: "nonce",
			anchor: {
				kind: "text",
				path: "html>body:nth-of-type(1)>main:nth-of-type(1)",
				quote: "Q2",
				prefix: "",
				suffix: "",
			},
		}),
	).toMatchObject({ type: "page-comment-anchor", anchor: { quote: "Q2" } });
	expect(
		message({
			type: "page-comment-layout",
			nonce: "nonce",
			items: [{ thread: "01M3D5Q1S0KXJ0BVEHDVFFVMS8", x: 20, y: 40 }],
		}),
	).toMatchObject({ type: "page-comment-layout", items: [{ x: 20, y: 40 }] });
	expect(
		message({ type: "page-comment-anchor-error", nonce: "nonce", message: "Select 2,000 characters or fewer." }),
	).toMatchObject({ type: "page-comment-anchor-error" });
});
test("rejects a foreign frame and a foreign nonce", () => {
	expect(message({ type: "page-ready", nonce: "nonce" }, {} as Window)).toBeNull();
	expect(message({ type: "page-ready", nonce: "other" })).toBeNull();
});
test("refuses mutations and invalid coordinates even from the right frame", () => {
	for (const data of [
		{ type: "page-delete", nonce: "nonce" },
		{ type: "page-comment-resolve", nonce: "nonce", thread: "01M3D5Q1S0KXJ0BVEHDVFFVMS8" },
		{ type: "page-comment-anchor", nonce: "nonce", anchor: { kind: "element", path: "main .forged" } },
		{ type: "page-comment-layout", nonce: "nonce", items: [{ thread: "known", x: -1, y: 4 }] },
		{ type: "page-scroll", nonce: "nonce", x: 0, y: Infinity },
		{ type: "page-scroll", nonce: "nonce", x: 0, y: -1 },
		{ type: "page-ready", nonce: "nonce", action: "delete" },
		null,
	])
		expect(message(data)).toBeNull();
});
