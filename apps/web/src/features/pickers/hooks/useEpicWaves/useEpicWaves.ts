import { useQueries } from "@tanstack/react-query";
import type { Epic, WaveSummary } from "@trellis/api";
import { useApp } from "../../../../lib/appContext";

// One epic with its waves in position order. `currentWave` is the
// first wave that is not done, or null.
export type EpicWaves = {
	epic: Pick<Epic, "id" | "ref" | "name" | "currentWave">;
	waves: readonly WaveSummary[];
};

export type EpicWavesLoad = {
	epics: EpicWaves[];
	// True while the first request of one epic is in flight. A refetch of a
	// loaded epic and a failed request are not pending.
	pending: boolean;
};

const combine = (results: readonly { data: Epic | undefined; isPending: boolean }[]): EpicWavesLoad => ({
	epics: results
		.map((result) => result.data)
		.filter((epic) => epic !== undefined)
		.map((epic) => ({
			epic: { id: epic.id, ref: epic.ref, name: epic.name, currentWave: epic.currentWave },
			waves: epic.waves,
		})),
	pending: results.some((result) => result.isPending),
});

// The waves of each epic in `epics`, a list of epic refs, in the order
// of that list. `epics.get` is the read that carries the waves of an
// epic, so the hook sends one request per epic, under the query key of the
// epic page. An epic appears in the result when its request lands.
export const useEpicWavesLoad = (epics: readonly string[], enabled = true): EpicWavesLoad => {
	const { orpc } = useApp();
	return useQueries({
		queries: epics.map((epic) => ({ ...orpc.epics.get.queryOptions({ input: { epic } }), enabled })),
		combine,
	});
};

// The landed epics of `useEpicWavesLoad`, for a caller that draws the
// list as it fills.
export const useEpicWaves = (epics: readonly string[], enabled = true): EpicWaves[] =>
	useEpicWavesLoad(epics, enabled).epics;
