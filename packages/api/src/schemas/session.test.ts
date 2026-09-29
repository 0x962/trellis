import { describe, expect, test } from "bun:test";
import { SessionCreateInputSchema } from "./session.ts";

describe("SessionCreateInputSchema", () => {
	test("retains all 21 selected files in order", () => {
		const files = Array.from({ length: 21 }, (_, index) => new File([String(index)], `note-${index}.txt`));
		const input = SessionCreateInputSchema.parse({ prompt: "", files });
		expect(input.files).toHaveLength(21);
		for (const [index, file] of files.entries()) expect(input.files![index]).toBe(file);
	});

	test.each([
		"01M3NZ54MSRSPAEMD2HV2DJFM2",
		"/private/another-session/attachments/secret.txt",
		{ id: "01M3NZ54MSRSPAEMD2HV2DJFM2", name: "secret.txt" },
	])("rejects an attachment reference after 20 valid uploads: %j", (reference) => {
		const files = Array.from({ length: 20 }, () => new File(["text"], "note.txt"));
		const result = SessionCreateInputSchema.safeParse({ prompt: "Read the files", files: [...files, reference] });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.issues[0]!.path).toEqual(["files", 20]);
	});

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
