import { expect, test } from "bun:test";
import { SearchQuerySchema } from "./search.ts";

// A person types the search text and the limit, so each bound reads as a
// sentence and never as zod's own wording.
test("an empty search text reads as a sentence", () => {
	expect(SearchQuerySchema.safeParse({ q: "" }).error!.issues[0]!.message).toBe("Enter the text to search for.");
});

test("a search limit out of bounds reads as a sentence", () => {
	expect(SearchQuerySchema.safeParse({ q: "deploy", limit: "0" }).error!.issues[0]!.message).toBe(
		"Enter a limit of 1 to 50.",
	);
	expect(SearchQuerySchema.safeParse({ q: "deploy", limit: "51" }).error!.issues[0]!.message).toBe(
		"Enter a limit of 1 to 50.",
	);
});
