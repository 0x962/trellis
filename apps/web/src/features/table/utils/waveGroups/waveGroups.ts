import type { WaveSummary } from "@trellis/api";
import { formatCount } from "../../../../lib/format";

// What the header of one wave group prints beside its label.
export type WaveMark = {
	// The done tickets over the tickets that count, `3/11`. A canceled ticket
	// is never in the total.
	countLabel: string;
	// The tickets that set the wave progress circle, done or canceled.
	completedCount: number;
	totalCount: number;
	// True when the wave holds at least one ticket and every ticket of it is
	// done or canceled. The header of the wave then draws a full progress mark.
	done: boolean;
};

// The marks of the waves of one epic, by wave id. `waves` is in position order.
export const waveMarks = (waves: readonly WaveSummary[]): Map<string, WaveMark> =>
	new Map(
		waves.map((wave) => {
			const { counts } = wave;
			const mark: WaveMark = {
				countLabel: `${formatCount(counts.done)}/${formatCount(counts.total - counts.canceled)}`,
				completedCount: counts.done + counts.canceled,
				totalCount: counts.total,
				done: wave.state === "done",
			};
			return [wave.id, mark];
		}),
	);

// The group keys of the done waves. A table of one epic collapses them
// until the first toggle on its route. A wave group has the wave
// id as its key.
export const doneWaveIds = (waves: readonly WaveSummary[]): string[] =>
	waves.filter((wave) => wave.state === "done").map((wave) => wave.id);
