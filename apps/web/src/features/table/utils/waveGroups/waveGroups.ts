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

// Wave groups keep the position order within each state. Open waves come
// first, the No wave group comes next, and done waves come last.
export const orderWaveGroups = (groups: readonly RowGroup[], waves: readonly WaveSummary[]): RowGroup[] => {
	const byKey = new Map(groups.map((group) => [group.key, group]));
	const listed = new Set(waves.map((wave) => wave.id));
	const groupsOf = (state: WaveSummary["state"]) =>
		waves.flatMap((wave) => {
			if (wave.state !== state) return [];
			const group = byKey.get(wave.id);
			return group === undefined ? [] : [group];
		});
	const unlisted = groups.filter((group) => group.key !== "none" && !listed.has(group.key));
	const noWave = byKey.get("none");
	return [...groupsOf("open"), ...unlisted, ...(noWave === undefined ? [] : [noWave]), ...groupsOf("done")];
};

// `withEmptyWaves` adds a group only for a wave with no ticket. A wave
// that has tickets but no visible row gets no group, because a filter hides
// its rows. `orderWaveGroups` sets the display order.
export const withEmptyWaves = (groups: readonly RowGroup[], waves: readonly WaveSummary[]): RowGroup[] => {
	const byKey = new Map(groups.map((group) => [group.key, group]));
	const empty = waves.flatMap((wave): RowGroup[] => {
		if (byKey.has(wave.id)) return [];
		if (wave.counts.total > 0) return [];
		return [{ key: wave.id, label: wave.name, rows: [], wave: { id: wave.id, ref: wave.ref, name: wave.name } }];
	});
	return orderWaveGroups([...groups, ...empty], waves);
};
