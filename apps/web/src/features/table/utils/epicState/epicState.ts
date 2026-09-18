import type { TicketSummary } from "@trellis/api";

// How a set of tickets holds an epic and a milestone. A bulk picker marks
// the shared value as current, and marks no row when the tickets disagree.
// A ticket with no epic, or with no milestone, counts as one of the values.
export type EpicState = {
	// The ref of the epic that every ticket belongs to. It is undefined when
	// no ticket has an epic, and when `epicMixed` is true. A milestone belongs
	// to one epic, so a set without this ref has no milestones to offer.
	epicRef?: string;
	epicMixed: boolean;
	// The ref of the milestone that every ticket holds. It is undefined when
	// no ticket has a milestone, and when `milestoneMixed` is true.
	milestoneRef?: string;
	milestoneMixed: boolean;
};

export const epicState = (rows: readonly TicketSummary[]): EpicState => {
	const epics = new Set(rows.map((row) => row.epic?.ref ?? null));
	const milestones = new Set(rows.map((row) => row.milestone?.ref ?? null));
	return {
		epicRef: epics.size === 1 ? ([...epics][0] ?? undefined) : undefined,
		epicMixed: epics.size > 1,
		milestoneRef: milestones.size === 1 ? ([...milestones][0] ?? undefined) : undefined,
		milestoneMixed: milestones.size > 1,
	};
};
