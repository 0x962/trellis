import { expect, test } from "bun:test";
import { answerMessage, reviewMessage } from "./deliveryMessage.ts";

test("the answer message names the question, the comment and the waiting ticket", () => {
	expect(answerMessage({ question: "TRL-8", waiting: "TRL-9", commentId: "01ABC" })).toBe(
		"trellis: TRL-8 has an answer. Read: trellis thread show 01ABC\nContinue the work on TRL-9.",
	);
});

test("a request for changes names the verdict, the note and the threads", () => {
	expect(
		reviewMessage({
			url: "https://github.com/o/r/pull/1",
			drafts: 3,
			verdict: "changes_requested",
			body: "Fix the count.",
		}),
	).toBe(
		"trellis: your pull request needs changes. The review has 3 comments.\nReview note: Fix the count.\nRead the threads: trellis review list https://github.com/o/r/pull/1\nApply what each thread asks. Answer each thread.",
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
