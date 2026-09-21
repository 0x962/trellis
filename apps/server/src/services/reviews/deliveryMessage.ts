// What an agent reads in its terminal when a delivery reaches it. Both
// sentences name the command that reads the new text and the work to
// continue, so an agent learns one shape.

// The answer of a question ticket. `question` is the ticket that holds the
// answer comment, and `waiting` is the ticket the agent works on.
export const answerMessage = (input: { question: string; waiting: string; commentId: string }) =>
	`trellis: ${input.question} has an answer. Read: trellis thread show ${input.commentId}\nContinue the work on ${input.waiting}.`;

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
