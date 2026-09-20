import type { AgentRun, Epic, EpicSummary, MilestoneSummary } from "@trellis/api";
import { formatCount } from "../../../lib/format";
import { isAgentWorking } from "../../agents/isAgentWorking";
import type { View } from "../../filters/grammar";

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

// What happens next in an epic: the current milestone and its three counts.
// Every ticket of one milestone can start at the same time, so the open
// tickets of the current milestone are the next work. The server supplies
// `toStart` and `waitsForYou`. The assigned-run query supplies the working
// runs. This module is the one place in the web that reads these values for
// the header band and the list row. The result is null when every milestone
// is done or the epic has none.
//
// Each link keeps the other filters and the display fields of `search`, and
// replaces the milestone, status, category, and reviewer filters. The to
// start link lists the whole todo category of the milestone, because the
// filter grammar has no filter for a ticket without an agent run. For the
// same reason the running count has no link.
export const epicNext = (
	epic: Pick<Epic, "currentMilestone" | "milestones" | "tickets">,
	runs: readonly AgentRun[],
	search: Partial<View>,
): EpicNext | null => {
	const milestone = epic.milestones.find((entry) => entry.id === epic.currentMilestone?.id);
	if (milestone === undefined) return null;
	const ticketIds = new Set(
		epic.tickets.filter((ticket) => ticket.milestone?.id === milestone.id).map((ticket) => ticket.id),
	);
	const running = runs.filter(
		(run) => run.kind === "agent" && run.ticketId !== null && ticketIds.has(run.ticketId) && isAgentWorking(run),
	).length;
	const { status, category, reviewer, milestone: _milestone, not, ...rest } = search;
	const kept = not?.filter((field) => field !== "status");
	const base: Partial<View> = {
		...rest,
		...(kept === undefined || kept.length === 0 ? {} : { not: kept }),
		milestone: milestone.ref,
	};
	return {
		milestone,
		counts: [
			{ key: "toStart", label: `${formatCount(milestone.toStart)} to start`, search: { ...base, category: ["todo"] } },
			{ key: "running", label: `${formatCount(running)} running`, search: null },
			{
				key: "waitsForYou",
				label: `${formatCount(milestone.waitsForYou)} ${milestone.waitsForYou === 1 ? "waits" : "wait"} for you`,
				search: { ...base, reviewer: "human" },
			},
		],
	};
};

// "Surfaces · 2 of 4", as the epics list row prints it after the epic name.
// Null when the epic has no open milestone.
export const currentMilestoneLabel = (
	epic: Pick<EpicSummary, "currentMilestone" | "currentMilestoneIndex" | "milestoneCount">,
): string | null =>
	epic.currentMilestone === null || epic.currentMilestoneIndex === null
		? null
		: `${epic.currentMilestone.name} · ${formatCount(epic.currentMilestoneIndex)} of ${formatCount(epic.milestoneCount)}`;
