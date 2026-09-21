import { expect, test } from "bun:test";
import { reviewMessage } from "./deliveryMessage.ts";

test("a request for changes names the verdict, the note and the comments", () => {
	expect(
		reviewMessage({
			url: "https://github.com/o/r/pull/1",
			drafts: 3,
			verdict: "changes_requested",
			body: "Fix the count.",
		}),
	).toBe(
		"trellis: your pull request needs changes. The review has 3 comments.\nReview note: Fix the count.\nRead the comments: trellis review list https://github.com/o/r/pull/1\nApply what each comment asks. Answer each comment.",
	);
	expect(
		reviewMessage({ url: "https://github.com/o/r/pull/1", drafts: 1, verdict: "commented", body: "Read this." }),
	).toContain("1 comment.");
});

test("an approval tells the agent that the review passed and waits for the merge", () => {
	expect(reviewMessage({ url: "https://github.com/o/r/pull/1", drafts: 0, verdict: "approved", body: "" })).toBe(
		"trellis: your pull request review passed. It waits for the merge.",
	);
});
