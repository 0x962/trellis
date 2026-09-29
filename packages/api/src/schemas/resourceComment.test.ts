import { expect, test } from "bun:test";
import {
	ResourceCommentAnchorSchema,
	ResourceCommentBodySchema,
	ResourceCommentCreateInputSchema,
	ResourceCommentEditInputSchema,
	ResourceCommentReplyInputSchema,
} from "./resourceComment.ts";

const id = "01M3NZ53ZC1QNQ3CZRE2A1BXXA";
const body = `Start\n${"漢é🙂".repeat(4_000)}\nEnd`;
const anchor = { quote: `First\n${"文é🙂".repeat(1_000)}\nLast`, prefix: "Before ", suffix: " after" };

test("document comment writes retain complete multibyte bodies and quotes", () => {
	expect(ResourceCommentCreateInputSchema.parse({ resource: id, body, anchor })).toEqual({
		resource: id,
		body,
		anchor,
	});
	expect(ResourceCommentReplyInputSchema.parse({ thread: id, body }).body).toBe(body);
	expect(ResourceCommentEditInputSchema.parse({ id, body }).body).toBe(body);
});

test("document comments retain nonempty text and bounded anchor context", () => {
	expect(ResourceCommentBodySchema.safeParse(" \n\t ").success).toBe(false);
	expect(ResourceCommentBodySchema.parse(" comment \n")).toBe("comment");
	expect(ResourceCommentAnchorSchema.safeParse({ ...anchor, quote: "" }).success).toBe(false);
	expect(ResourceCommentAnchorSchema.safeParse({ ...anchor, prefix: "a".repeat(33) }).success).toBe(false);
	expect(ResourceCommentAnchorSchema.safeParse({ ...anchor, suffix: "a".repeat(33) }).success).toBe(false);
	expect(ResourceCommentAnchorSchema.safeParse({ ...anchor, position: 1 }).success).toBe(false);
});
