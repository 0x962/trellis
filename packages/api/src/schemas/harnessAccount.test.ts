import { expect, test } from "bun:test";
import { HarnessAccountCreateSchema } from "./harnessAccount.ts";

// A person types the account name and the profile path in the accounts dialog,
// so each bound reads as a sentence and never as zod's own wording.
test("an account name or profile path out of bounds reads as a sentence", () => {
	const message = (input: Record<string, unknown>) =>
		HarnessAccountCreateSchema.safeParse({ name: "Work", harness: "claude", ...input }).error!.issues[0]!.message;
	expect(message({ name: "" })).toBe("Enter an account name of 1 to 120 characters.");
	expect(message({ name: "n".repeat(121) })).toBe("Enter an account name of 1 to 120 characters.");
	expect(message({ profilePath: "" })).toBe("Enter a profile directory path, or omit it.");
});
