// The description each seeded status carries, by status name. The texts
// match `ROOT_SEED` in `services/statusSet.ts` word for word.
export const SEEDED_DESCRIPTIONS: Record<string, string> = {
	Todo: "New work. Read it, ask in a comment when it is unclear, then start a builder.",
	"In Progress": "A builder works on this ticket. Forward each new comment to the builder.",
	"Agent Review": "A builder opened a PR. Run a reviewer.",
	"Human Review": "Waiting for the human reviewer. Do nothing unless they comment.",
	Done: "The work is complete. Close the builder's workspace.",
	Canceled: "Nobody works on this ticket. Stop its builder and close its workspace.",
};
