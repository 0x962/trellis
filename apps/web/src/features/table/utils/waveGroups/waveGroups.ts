import type { WaveSummary } from "@trellis/api";
import { formatCount } from "../../../../lib/format";
import type { RowGroup } from "../groupRows";

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

// The wave groups with one empty group for each wave that holds no ticket
// at all, in wave position order, and the No wave group last. A group
// comes from its rows, so a new wave has no group until this adds it. A
// wave whose tickets a filter hides still counts tickets, so it gets no
// empty group, and a filtered view never claims that a wave is empty.
export const withEmptyWaves = (groups: readonly RowGroup[], waves: readonly WaveSummary[]): RowGroup[] => {
	const byKey = new Map(groups.map((group) => [group.key, group]));
	const ordered = waves.flatMap((wave): RowGroup[] => {
		const group = byKey.get(wave.id);
		if (group !== undefined) return [group];
		if (wave.counts.total > 0) return [];
		return [{ key: wave.id, label: wave.name, rows: [], wave: { id: wave.id, ref: wave.ref, name: wave.name } }];
	});
	const listed = new Set(waves.map((wave) => wave.id));
	return [...ordered, ...groups.filter((group) => !listed.has(group.key))];
};
