import type { TicketSummary } from "@trellis/api";

// How a set of tickets holds an epic and a wave. A bulk picker marks
// the shared value as current, and marks no row when the tickets disagree.
// A ticket with no epic, or with no wave, counts as one of the values.
export type EpicState = {
	// The ref of the epic that every ticket belongs to. It is undefined when
	// no ticket has an epic, and when `epicMixed` is true. A wave belongs
	// to one epic, so a set without this ref has no waves to offer.
	epicRef?: string;
	epicMixed: boolean;
	// The ref of the wave that every ticket holds. It is undefined when
	// no ticket has a wave, and when `waveMixed` is true.
	waveRef?: string;
	waveMixed: boolean;
};

export const epicState = (rows: readonly TicketSummary[]): EpicState => {
	const epics = new Set(rows.map((row) => row.epic?.ref ?? null));
	const waves = new Set(rows.map((row) => row.wave?.ref ?? null));
	return {
		epicRef: epics.size === 1 ? ([...epics][0] ?? undefined) : undefined,
		epicMixed: epics.size > 1,
		waveRef: waves.size === 1 ? ([...waves][0] ?? undefined) : undefined,
		waveMixed: waves.size > 1,
	};
};
