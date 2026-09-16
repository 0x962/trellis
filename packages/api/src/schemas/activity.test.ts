import { expect, test } from "bun:test";
import { TimelineListInputSchema } from "./activity.ts";

// A person types the page limit on the command line, so each bound reads as a
// sentence and never as zod's own wording.
test("a timeline limit out of bounds reads as a sentence", () => {
	const message = (limit: string) =>
		TimelineListInputSchema.safeParse({ ticket: "TRL-18", limit }).error!.issues[0]!.message;
	expect(message("0")).toBe("Enter a limit of 1 to 100.");
	expect(message("101")).toBe("Enter a limit of 1 to 100.");
});
