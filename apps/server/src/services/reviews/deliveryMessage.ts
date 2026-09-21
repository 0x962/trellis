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
	if (input.drafts === 0) return `${opening}${note}`;
	const count = `The review has ${input.drafts} ${input.drafts === 1 ? "comment" : "comments"}.`;
	return `${opening} ${count}${note}\nRead the comments: trellis review list ${input.url}\nApply what each comment asks. Answer each comment.`;
};

// One comment a person wrote on a diff line. `body` is the text of that one
// comment, and `path` with `line` is the place the thread points at.
export type CommentNote = { path: string; line: number; body: string };

// The comments a person wrote on the pull request of an agent. One message
// carries every comment the dispatcher holds for that agent, so ten
// comments in a row stop the work once. The text of each comment travels
// with it, because the agent can read and answer without another command.
export const commentMessage = (input: { url: string; comments: CommentNote[] }) => {
	const count = input.comments.length;
	const opening = `trellis: your pull request has ${count} new ${count === 1 ? "comment" : "comments"}.`;
	const notes = input.comments.map((comment) => `${comment.path}:${comment.line}\n${comment.body}`).join("\n\n");
	return `${opening}\n${notes}\nRead every comment: trellis review list ${input.url}\nApply what each comment asks. Answer each comment.`;
};
