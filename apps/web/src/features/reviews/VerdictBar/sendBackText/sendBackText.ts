// The words of the three controls that carry a review: the count of the
// drafts, the name on `Send back`, the message the agent reads, and the
// sentence the person reads after the send.

// A draft is a review thread on the reviewed commit that no review
// submission has carried yet. `Send back` and `Comment only` both carry
// exactly these threads, so this count tells the person how many comments
// leave with one click.
export const draftCount = (drafts: number) => `${drafts} ${drafts === 1 ? "draft" : "drafts"}`;

// `Send back` names the agent that takes the ticket next, because one agent
// on one ticket is the next actor. A ticket whose agent assignment is
// closed has no name to print, and the click starts a new agent.
export const sendBackLabel = (runName: string | null) =>
	runName === null ? "Send back to a new agent" : `Send back to ${runName}`;

// What the agent reads in its terminal. `dispatchAnswerDeliveries` in
// `apps/server/src/services/reviews/dispatchDeliveries.ts` writes the
// message of an answered question in the same shape: the `trellis:` prefix,
// the command that reads the new text, and the work to continue.
export const sendBackMessage = (input: { pr: string; ticket: string; drafts: number }) =>
	`trellis: the review of ${input.ticket} has ${draftCount(input.drafts)}.\nRead the threads: trellis review list ${input.pr}\nApply what each thread asks. Answer each thread.`;

// What the toast says after the drafts reach an agent. The name is the name
// the button printed, so the person reads the same word twice.
export const sendBackResult = (runName: string) => `${runName} has the review.`;
