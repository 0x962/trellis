import { useQueries } from "@tanstack/react-query";
import type { Epic, MilestoneSummary } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";

// One epic with its milestones in position order. `currentMilestone` is the
// first milestone that is not done, or null.
export type EpicMilestones = {
	epic: Pick<Epic, "id" | "ref" | "name" | "currentMilestone">;
	milestones: readonly MilestoneSummary[];
};

export type EpicMilestonesLoad = {
	epics: EpicMilestones[];
	// True while the first request of one epic is in flight. A refetch of a
	// loaded epic and a failed request are not pending.
	pending: boolean;
};

const combine = (results: readonly { data: Epic | undefined; isPending: boolean }[]): EpicMilestonesLoad => ({
	epics: results
		.map((result) => result.data)
		.filter((epic) => epic !== undefined)
		.map((epic) => ({
			epic: { id: epic.id, ref: epic.ref, name: epic.name, currentMilestone: epic.currentMilestone },
			milestones: epic.milestones,
		})),
	pending: results.some((result) => result.isPending),
});

// The milestones of each epic in `epics`, a list of epic refs, in the order
// of that list. `epics.get` is the read that carries the milestones of an
// epic, so the hook sends one request per epic, under the query key of the
// epic page. An epic appears in the result when its request lands.
export const useEpicMilestonesLoad = (epics: readonly string[], enabled = true): EpicMilestonesLoad => {
	const { orpc } = useApp();
	return useQueries({
		queries: epics.map((epic) => ({ ...orpc.epics.get.queryOptions({ input: { epic } }), enabled })),
		combine,
	});
};

// The landed epics of `useEpicMilestonesLoad`, for a caller that draws the
// list as it fills.
export const useEpicMilestones = (epics: readonly string[], enabled = true): EpicMilestones[] =>
	useEpicMilestonesLoad(epics, enabled).epics;
