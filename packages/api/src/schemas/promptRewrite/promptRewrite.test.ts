import { expect, test } from "bun:test";
import { PromptRewriteInputSchema, PromptRewriteOutputSchema } from "./promptRewrite.ts";

test("preserves source whitespace, literal code, and Unicode", () => {
	const text = "  Do not change `price <= 12.50`.\nKeep مثال and /api/v1.\n";
	expect(PromptRewriteInputSchema.parse({ text })).toEqual({ text });
	expect(PromptRewriteOutputSchema.parse({ text })).toEqual({ text });
});

test.each(["", " \n\t "])("rejects empty source %j", (text) => {
	expect(PromptRewriteInputSchema.safeParse({ text }).success).toBe(false);
});

test("clients cannot select a provider, model, or instructions", () => {
	for (const key of ["provider", "model", "instructions"]) {
		expect(PromptRewriteInputSchema.safeParse({ text: "Keep all requirements.", [key]: "override" }).success).toBe(
			false,
		);
	}
});
