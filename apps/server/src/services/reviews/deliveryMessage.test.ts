import { expect, test } from "bun:test";
import { answerMessage, reviewMessage } from "./deliveryMessage.ts";

test("the answer message names the question, the comment and the waiting ticket", () => {
	expect(answerMessage({ question: "TRL-8", waiting: "TRL-9", commentId: "01ABC" })).toBe(
		"trellis: TRL-8 has an answer. Read: trellis thread show 01ABC\nContinue the work on TRL-9.",
	);
});

test("the review message counts the comments and names the command that reads them", () => {
	expect(reviewMessage({ url: "https://github.com/o/r/pull/1", drafts: 3 })).toBe(
		"trellis: your pull request has a review with 3 comments.\nRead the threads: trellis review list https://github.com/o/r/pull/1\nApply what each thread asks. Answer each thread.",
	);
	expect(reviewMessage({ url: "https://github.com/o/r/pull/1", drafts: 1 })).toContain("1 comment.");
});
