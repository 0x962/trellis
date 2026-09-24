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

const wavesByState = (waves: readonly WaveSummary[]): [WaveSummary[], WaveSummary[]] => [
	waves.filter((wave) => wave.state === "open"),
	waves.filter((wave) => wave.state === "done"),
];

export const orderWaves = (waves: readonly WaveSummary[]): WaveSummary[] => wavesByState(waves).flat();

// Each state keeps the wave position order. A group whose key matches no
// wave in `waves` keeps its place after the open waves.
export const orderWaveGroups = (groups: readonly RowGroup[], waves: readonly WaveSummary[]): RowGroup[] => {
	const byKey = new Map(groups.map((group) => [group.key, group]));
	const waveIds = new Set(waves.map((wave) => wave.id));
	const groupsOf = (stateWaves: readonly WaveSummary[]) =>
		stateWaves.flatMap((wave) => {
			const group = byKey.get(wave.id);
			return group === undefined ? [] : [group];
		});
	const [openWaves, doneWaves] = wavesByState(waves);
	const unknownWaveGroups = groups.filter((group) => group.key !== "none" && !waveIds.has(group.key));
	const noWave = byKey.get("none");
	return [
		...groupsOf(openWaves),
		...unknownWaveGroups,
		...(noWave === undefined ? [] : [noWave]),
		...groupsOf(doneWaves),
	];
};

// A wave gets an empty group only when the wave holds no ticket at all. A
// wave whose tickets a filter hides still counts tickets, so a filtered
// view never shows that wave as empty.
export const withEmptyWaves = (groups: readonly RowGroup[], waves: readonly WaveSummary[]): RowGroup[] => {
	const byKey = new Map(groups.map((group) => [group.key, group]));
	const emptyWaveGroups = waves.flatMap((wave): RowGroup[] => {
		if (byKey.has(wave.id)) return [];
		if (wave.counts.total > 0) return [];
		return [{ key: wave.id, label: wave.name, rows: [], wave: { id: wave.id, ref: wave.ref, name: wave.name } }];
	});
	return orderWaveGroups([...groups, ...emptyWaveGroups], waves);
};
