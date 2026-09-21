// What an agent reads in its terminal when a delivery reaches it. Both
// sentences name the command that reads the new text and the work to
// continue, so an agent learns one shape.

// The answer of a question ticket. `question` is the ticket that holds the
// answer comment, and `waiting` is the ticket the agent works on.
export const answerMessage = (input: { question: string; waiting: string; commentId: string }) =>
	`trellis: ${input.question} has an answer. Read: trellis thread show ${input.commentId}\nContinue the work on ${input.waiting}.`;

// A review that a person sent back. `drafts` counts the threads the
// submission carried, and `url` is the pull request the agent opened.
export const reviewMessage = (input: { url: string; drafts: number }) =>
	`trellis: your pull request has a review with ${input.drafts} ${input.drafts === 1 ? "comment" : "comments"}.\nRead the threads: trellis review list ${input.url}\nApply what each thread asks. Answer each thread.`;
