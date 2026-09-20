import type { AgentRun, Epic, EpicSummary, MilestoneSummary } from "@trellis/api";
import { formatCount } from "../../../lib/format";
import { workingTargets } from "../../agents/workingTargets";
import type { View } from "../../filters/grammar";
import { forYouCount, type WorkingTicketIds } from "../../table/utils/turnGroups";

export type EpicNextCount = {
	key: "toStart" | "running" | "waitsForYou";
	// "3 to start", as the header band prints it.
	label: string;
	// The epic page search that lists the counted tickets, or null when the
	// filter grammar has no filter for them.
	search: Partial<View> | null;
};

export type EpicNext = {
	milestone: MilestoneSummary;
	counts: EpicNextCount[];
};

// The ticket targets of assigned agent runs that currently work.
export const epicWorkingTicketIds = (runs: readonly AgentRun[]): string[] =>
	workingTargets(runs.filter((run) => run.kind === "agent")).ticketIds;

// The number of working agent targets in the current milestone.
export const epicRunningCount = (
	epic: Pick<Epic, "currentMilestone" | "milestones" | "tickets">,
	workingTicketIds: readonly string[],
): number => {
	const milestone = epic.milestones.find((entry) => entry.id === epic.currentMilestone?.id);
	if (milestone === undefined) return 0;
	const milestoneTicketIds = new Set(
		epic.tickets.filter((ticket) => ticket.milestone?.id === milestone.id).map((ticket) => ticket.id),
	);
	return workingTicketIds.filter((ticketId) => milestoneTicketIds.has(ticketId)).length;
};

// What happens next in an epic: the current milestone and its available counts.
// Every ticket of one milestone can start at the same time, so the open
// tickets of the current milestone are the next work. The server supplies
// `toStart`. The epic page supplies `running` after its assigned-run query
// succeeds. `waitsForYou` counts the tickets of the milestone whose turn is
// the person: a question he must answer, or a pull request he must review.
// The wave group header of the table counts its own rows the same way, with
// `forYouCount`, so the band and the header agree. This module is the one
// place in the web that reads these values for the header band and the list
// row. The result is null when every milestone is done or the epic has none.
//
// Each link keeps the other filters and the display fields of `search`, and
// replaces the milestone, status, category, and reviewer filters. The to
// start link lists the whole todo category of the milestone, because the
// filter grammar has no dependency-ready filter. The waits for you link
// groups the table by turn, because no filter names a turn: the `Your turn`
// group then holds the counted tickets. The running count has no link
// because the grammar has no working-agent filter.
export const epicNext = (
	epic: Pick<Epic, "currentMilestone" | "milestones" | "tickets">,
	running: number | null,
	search: Partial<View>,
	workingTicketIds: WorkingTicketIds,
): EpicNext | null => {
	const milestone = epic.milestones.find((entry) => entry.id === epic.currentMilestone?.id);
	if (milestone === undefined) return null;
	const { status, category, reviewer, milestone: _milestone, not, ...rest } = search;
	const kept = not?.filter((field) => field !== "status");
	const base: Partial<View> = {
		...rest,
		...(kept === undefined || kept.length === 0 ? {} : { not: kept }),
		milestone: milestone.ref,
	};
	const counts: EpicNextCount[] = [
		{ key: "toStart", label: `${formatCount(milestone.toStart)} to start`, search: { ...base, category: ["todo"] } },
	];
	if (running !== null) counts.push({ key: "running", label: `${formatCount(running)} running`, search: null });
	const waitsForYou = forYouCount(
		epic.tickets.filter((ticket) => ticket.milestone?.id === milestone.id),
		workingTicketIds,
	);
	counts.push({
		key: "waitsForYou",
		label: `${formatCount(waitsForYou)} ${waitsForYou === 1 ? "waits" : "wait"} for you`,
		search: { ...base, group: "turn" },
	});
	return { milestone, counts };
};

// "Surfaces · 2 of 4", as the epics list row prints it after the epic name.
// Null when the epic has no open milestone.
export const currentMilestoneLabel = (
	epic: Pick<EpicSummary, "currentMilestone" | "currentMilestoneIndex" | "milestoneCount">,
): string | null =>
	epic.currentMilestone === null || epic.currentMilestoneIndex === null
		? null
		: `${epic.currentMilestone.name} · ${formatCount(epic.currentMilestoneIndex)} of ${formatCount(epic.milestoneCount)}`;
