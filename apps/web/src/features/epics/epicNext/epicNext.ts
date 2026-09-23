import type { AgentRun, Epic, EpicSummary, WaveSummary } from "@trellis/api";
import { formatCount } from "../../../lib/format";
import { workingTargets } from "../../agents/workingTargets";
import type { View } from "../../filters/grammar";
import { forYouCount, type WorkingTicketIds } from "../../table/utils/waitingGroups";

export type EpicNextCount = {
	key: "toStart" | "running" | "waitsForYou";
	// "3 to start", as the header band prints it.
	label: string;
	// The epic page search that lists the counted tickets, or null when the
	// filter grammar has no filter for them.
	search: Partial<View> | null;
};

export type EpicNext = {
	wave: WaveSummary;
	counts: EpicNextCount[];
};

// The ticket targets of assigned agent runs that currently work.
export const epicWorkingTicketIds = (runs: readonly AgentRun[]): string[] =>
	workingTargets(runs.filter((run) => run.kind === "agent")).ticketIds;

// The tickets the epic holds that point at one wave.
const waveTickets = (epic: Pick<Epic, "tickets">, waveId: string) =>
	epic.tickets.filter((ticket) => ticket.wave?.id === waveId);

// The wave the epic works on now, or undefined when every wave is
// done and when the epic has none.
const currentWave = (epic: Pick<Epic, "currentWave" | "waves">) =>
	epic.waves.find((entry) => entry.id === epic.currentWave?.id);

// The number of working agent targets in the current wave.
export const epicRunningCount = (
	epic: Pick<Epic, "currentWave" | "waves" | "tickets">,
	workingTicketIds: WorkingTicketIds,
): number => {
	const wave = currentWave(epic);
	if (wave === undefined) return 0;
	return waveTickets(epic, wave.id).filter((ticket) => workingTicketIds.has(ticket.id)).length;
};

// What happens next in an epic: the current wave and its available counts.
// Every ticket of one wave can start at the same time, so the open
// tickets of the current wave are the next work. The server supplies
// `toStart`. `waitsForYou` counts every ticket of the epic that waits for
// the person. The wave group headers apply `forYouCount` to each wave, so
// their counts add to the count here. This module is the one place in the
// web that reads these values for the header band and the list row. The
// result is null when every wave is done or the epic has none.
//
// `running` and `workingTicketIds` are null until the assigned-run query of
// the epic page succeeds. Their counts then stay out of the band, because a
// ticket whose agent works waits for the agent and not for the person.
//
// Each link keeps the other filters and the display fields of `search`, and
// replaces the wave, status, category, and reviewer filters. The to
// start link lists the whole todo category of the wave, because the
// filter grammar has no dependency-ready filter. The waits for you link
// applies the Waiting grouping, because no filter names what a ticket waits
// for: the `Waits for you` group then holds the counted tickets. The running
// count has no link because the grammar has no working-agent filter.
export const epicNext = (
	epic: Pick<Epic, "currentWave" | "waves" | "tickets">,
	running: number | null,
	search: Partial<View>,
	workingTicketIds: WorkingTicketIds | null,
): EpicNext | null => {
	const wave = currentWave(epic);
	if (wave === undefined) return null;
	const { status, category, reviewer, wave: _wave, not, ...rest } = search;
	const kept = not?.filter((field) => field !== "status");
	const base: Partial<View> = {
		...rest,
		...(kept === undefined || kept.length === 0 ? {} : { not: kept }),
	};
	const counts: EpicNextCount[] = [
		{
			key: "toStart",
			label: `${formatCount(wave.toStart)} to start`,
			search: { ...base, wave: wave.ref, category: ["todo"] },
		},
	];
	if (running !== null) counts.push({ key: "running", label: `${formatCount(running)} running`, search: null });
	if (workingTicketIds !== null) {
		const waitsForYou = forYouCount(epic.tickets, workingTicketIds);
		counts.push({
			key: "waitsForYou",
			label: `${formatCount(waitsForYou)} ${waitsForYou === 1 ? "waits" : "wait"} for you`,
			search: { ...base, group: "waiting" },
		});
	}
	return { wave, counts };
};

// "Surfaces · 2 of 4", as the epics list row prints it after the epic name.
// Null when the epic has no open wave.
export const currentWaveLabel = (
	epic: Pick<EpicSummary, "currentWave" | "currentWaveIndex" | "waveCount">,
): string | null =>
	epic.currentWave === null || epic.currentWaveIndex === null
		? null
		: `${epic.currentWave.name} · ${formatCount(epic.currentWaveIndex)} of ${formatCount(epic.waveCount)}`;
