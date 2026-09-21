// The words of the bar: the count of the drafts, the name on `Send back`,
// and the sentence the person reads after the send. The message the agent
// reads is written by the server, in
// `apps/server/src/services/reviews/deliveryMessage.ts`.

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

// What the toast says after the drafts reach an agent. The name is the name
// the button printed, so the person reads the same word twice.
export const sendBackResult = (runName: string) => `${runName} has the review.`;
