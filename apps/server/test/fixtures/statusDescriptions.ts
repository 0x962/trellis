// The description each seeded status carries, by status name. The texts
// match `ROOT_SEED` in `services/statusSet.ts` word for word.
export const SEEDED_DESCRIPTIONS: Record<string, string> = {
	Todo: "Work awaits its start. Clarify the requirements before work starts.",
	"In Progress": "Work on this ticket is in progress.",
	"Agent Review": "The pull request awaits an agent review.",
	"Human Review": "The pull request awaits a human review.",
	Done: "The work is complete.",
	Canceled: "Work on this ticket is canceled.",
};
