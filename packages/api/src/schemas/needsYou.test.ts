import { expect, test } from "bun:test";
import { NeedsYouListInputSchema } from "./needsYou.ts";

// A person types the page limit on the command line, so each bound reads as a
// sentence and never as zod's own wording.
test("a needs-you limit out of bounds reads as a sentence", () => {
	const message = (limit: number) => NeedsYouListInputSchema.safeParse({ limit }).error!.issues[0]!.message;
	expect(message(0)).toBe("Enter a limit of 1 to 200.");
	expect(message(201)).toBe("Enter a limit of 1 to 200.");
	expect(message(1.5)).toBe("Enter a whole number for the limit.");
});
