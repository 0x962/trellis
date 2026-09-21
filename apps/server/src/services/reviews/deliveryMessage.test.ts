import { expect, test } from "bun:test";
import { answerMessage, reviewMessage } from "./deliveryMessage.ts";

test("the answer message names the question, the option, the reason and the waiting ticket", () => {
	expect(
		answerMessage({
			question: "TRL-8",
			waiting: "TRL-9",
			description: "Which queue?\n\nOptions:\n1. One queue for all.\n2. One queue per routine.",
			option: 2,
			reason: "A slow routine must not block the rest.",
		}),
	).toBe(
		"trellis: TRL-8 has an answer.\nOption 2: One queue per routine.\nReason: A slow routine must not block the rest.\nContinue the work on TRL-9.",
	);
});

test("the answer message prints the bare number of an option the description no longer lists", () => {
	expect(
		answerMessage({ question: "TRL-8", waiting: "TRL-9", description: "No list.", option: 3, reason: "Why." }),
	).toBe("trellis: TRL-8 has an answer.\nOption 3\nReason: Why.\nContinue the work on TRL-9.");
});

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
