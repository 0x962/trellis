import type { WaveSummary } from "@trellis/api";
import { formatCount } from "../../../../lib/format";

// What the header of one wave group prints beside its label.
export type WaveMark = {
	// The done tickets over the tickets that count, `3/11`. A canceled ticket
	// is never in the total.
	countLabel: string;
	// "Current" on the current wave of the epic.
	badge?: string;
	// "Later" on an open wave after the current one. Order lives between
	// waves, so its tickets wait for the current wave.
	note?: string;
};

// The marks of the waves of one epic, by wave id. `waves` is
// in position order. `currentId` is the id of `EpicSummary.currentWave`:
// the first wave that is not done, or undefined when every wave is
// done.
export const waveMarks = (waves: readonly WaveSummary[], currentId: string | undefined): Map<string, WaveMark> => {
	const currentIndex = waves.findIndex((wave) => wave.id === currentId);
	return new Map(
		waves.map((wave, index) => {
			const { counts } = wave;
			const mark: WaveMark = {
				countLabel: `${formatCount(counts.done)}/${formatCount(counts.total - counts.canceled)}`,
			};
			if (index === currentIndex) mark.badge = "Current";
			else if (currentIndex !== -1 && index > currentIndex && wave.state === "open") mark.note = "Later";
			return [wave.id, mark];
		}),
	);
};

// The group keys of the done waves. A table of one epic collapses them
// until the first toggle on its route. A wave group has the wave
// id as its key.
export const doneWaveIds = (waves: readonly WaveSummary[]): string[] =>
	waves.filter((wave) => wave.state === "done").map((wave) => wave.id);
