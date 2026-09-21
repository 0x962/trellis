import { readQuestionDescription } from "@trellis/api";

// What an agent reads in its terminal when a delivery reaches it.

// The answer of a question ticket, in full, so the agent needs no second
// read. `question` is the ticket that holds the answer, `description` is its
// description, and `waiting` is the ticket the agent works on. An option
// number that the description no longer lists prints without its text.
export const answerMessage = (input: {
	question: string;
	waiting: string;
	description: string;
	option: number;
	reason: string;
}) => {
	const listed = readQuestionDescription(input.description).options.find((item) => item.number === input.option);
	const choice = listed === undefined ? `Option ${input.option}` : `Option ${input.option}: ${listed.text}`;
	return `trellis: ${input.question} has an answer.\n${choice}\nReason: ${input.reason}\nContinue the work on ${input.waiting}.`;
};

// A local verdict for the pull request of an agent. The message includes the
// note because `trellis review list` shows the comments, not the submission.
export const reviewMessage = (input: {
	url: string;
	drafts: number;
	verdict: "commented" | "changes_requested" | "approved";
	body: string;
}) => {
	const note = input.body === "" ? "" : `\nReview note: ${input.body}`;
	if (input.verdict === "approved") return `trellis: your pull request review passed. It waits for the merge.${note}`;
	const opening =
		input.verdict === "changes_requested"
			? "trellis: your pull request needs changes."
			: "trellis: your pull request has a comment.";
	const count = `The review has ${input.drafts} ${input.drafts === 1 ? "comment" : "comments"}.`;
	if (input.drafts === 0) return `${opening} ${count}${note}`;
	return `${opening} ${count}${note}\nRead the comments: trellis review list ${input.url}\nApply what each comment asks. Answer each comment.`;
};
