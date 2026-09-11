import { describe, expect, test } from "bun:test";
import { PersonaCreateInputSchema, PersonaUpdateInputSchema } from "./persona.ts";

describe("persona input schemas", () => {
	test("create trims both fields and preserves the instruction's inner whitespace", () => {
		expect(
			PersonaCreateInputSchema.parse({ name: " Reviewer ", instruction: "\nRead the diff.\n\n  Keep code literal.\n" }),
		).toEqual({ name: "Reviewer", instruction: "Read the diff.\n\n  Keep code literal." });
	});

	test("create accepts the maximum name and instruction lengths", () => {
		const input = { name: "n".repeat(120), instruction: "i".repeat(200_000) };
		expect(PersonaCreateInputSchema.parse(input)).toEqual(input);
	});

	test("update requires a valid persona id and both fields", () => {
		const input = { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "Reviewer", instruction: "Read the diff." };
		expect(PersonaUpdateInputSchema.parse(input)).toEqual(input);
		for (const invalid of [
			{ ...input, id: "unknown" },
			{ ...input, name: undefined },
			{ ...input, instruction: undefined },
			{ ...input, name: " \n " },
			{ ...input, instruction: " \n " },
			{ ...input, name: "n".repeat(121) },
			{ ...input, instruction: "i".repeat(200_001) },
		]) {
			expect(PersonaUpdateInputSchema.safeParse(invalid).success).toBe(false);
		}
	});
});
