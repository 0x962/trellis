import { expect, test } from "bun:test";
import { ReviewBodySchema, ReviewListSchema } from "./review.ts";

// A person types a review comment and a page limit, so each bound reads as a
// sentence and never as zod's own wording.
test("a review comment out of bounds reads as a sentence", () => {
	const message = (body: string) => ReviewBodySchema.safeParse(body).error!.issues[0]!.message;
	expect(message("")).toBe("Enter a review comment of 1 to 200,000 characters.");
	expect(message("b".repeat(200_001))).toBe("Enter a review comment of 1 to 200,000 characters.");
});

test("a review list limit out of bounds reads as a sentence", () => {
	const message = (limit: string) =>
		ReviewListSchema.safeParse({ pr: "owner/repo#1", limit }).error!.issues[0]!.message;
	expect(message("0")).toBe("Enter a limit of 1 to 500.");
	expect(message("501")).toBe("Enter a limit of 1 to 500.");
});
