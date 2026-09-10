import type { StatusCategory } from "@trellis/api";

export type TransitionInput = {
	startedAt: Date | null;
	completedAt: Date | null;
	from: StatusCategory;
	to: StatusCategory;
	now: Date;
};

export type TransitionResult = { startedAt: Date | null; completedAt: Date | null };

const isCompleted = (category: StatusCategory) => category === "done" || category === "canceled";

// The two ticket timestamps after a move from one status category to
// another. `started_at` is set once, the first time the ticket sits outside
// todo, and never rewritten. `completed_at` is set on entering done or
// canceled, kept on a move between those two, and cleared on leaving them.
// Every pair of categories is a legal move.
export const applyStatusTransition = ({
	startedAt,
	completedAt,
	from,
	to,
	now,
}: TransitionInput): TransitionResult => ({
	startedAt: startedAt ?? (to === "todo" ? null : now),
	completedAt: isCompleted(to) ? (isCompleted(from) ? (completedAt ?? now) : now) : null,
});
