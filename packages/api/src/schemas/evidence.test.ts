import { expect, test } from "bun:test";
import { EvidenceCheckInputSchema } from "./evidence.ts";

const check = {
	runId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
	command: "bun",
	args: ["run", "typecheck"],
	timeoutMs: 60000,
};

// A person types the command and its arguments when a check is registered, so
// each bound reads as a sentence and never as zod's own wording.
test("an evidence command or argument out of bounds reads as a sentence", () => {
	const message = (input: Record<string, unknown>) =>
		EvidenceCheckInputSchema.safeParse({ ...check, ...input }).error!.issues[0]!.message;
	expect(message({ command: "" })).toBe("Enter a command of 1 to 4096 characters.");
	expect(message({ command: "c".repeat(4097) })).toBe("Enter a command of 1 to 4096 characters.");
	expect(message({ args: ["a".repeat(20001)] })).toBe("Enter an argument of 20,000 characters or less.");
	expect(message({ args: Array.from({ length: 101 }, () => "a") })).toBe("Enter 100 arguments or less.");
});
