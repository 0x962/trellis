import { describe, expect, test } from "bun:test";
import { SessionCreateInputSchema, SessionNameSchema, SessionRenameInputSchema, SessionSchema } from "./session.ts";

describe("session names", () => {
	test.each([
		["ASCII", "a".repeat(61)],
		["Unicode", "界".repeat(4096)],
	])("preserves a complete %s name", (_, name) => {
		expect(SessionCreateInputSchema.parse({ name, prompt: "Inspect" }).name).toBe(name);
		expect(SessionRenameInputSchema.parse({ id: "session", name }).name).toBe(name);
		expect(SessionSchema.shape.name.parse(name)).toBe(name);
	});

	test("trims outer whitespace and rejects an empty name", () => {
		expect(SessionNameSchema.parse("  Session name  ")).toBe("Session name");
		expect(SessionNameSchema.safeParse(" \n ").success).toBe(false);
	});
});

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
