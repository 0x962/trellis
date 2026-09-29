import { describe, expect, test } from "bun:test";
import { SessionCreateInputSchema } from "./session.ts";

describe("SessionCreateInputSchema", () => {
	test.each([
		["ASCII", "a".repeat(20_001)],
		["multibyte", "界".repeat(20_001)],
	])("accepts a long %s prompt", (_, prompt) => expect(SessionCreateInputSchema.parse({ prompt }).prompt).toBe(prompt));

	test("rejects an empty prompt without a file", () => {
		expect(SessionCreateInputSchema.safeParse({ prompt: " \n " }).success).toBe(false);
	});

	test("accepts an empty prompt with a file", () => {
		expect(SessionCreateInputSchema.safeParse({ prompt: "", files: [new File(["text"], "note.txt")] }).success).toBe(
			true,
		);
	});
});
