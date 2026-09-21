import type { Status } from "@trellis/api";
import { useMemo } from "react";
import type { View } from "../../../filters/grammar";
import { useEpicWavesLoad } from "../../../pickers/hooks/useEpicWaves";
import { hasInlineClosed } from "../../utils/listQuery";
import { doneWaveIds } from "../../utils/waveGroups";
import { useCollapsedGroups } from "../useCollapsedGroups";
import { closedCategories, closedKey } from "../useTableGroups";

const noRefs: string[] = [];

// The collapse state of the groups of one table route, and the closed
// categories whose groups are open. A route with no stored entry collapses
// the Done and Canceled status groups. When the table shows one epic by
// wave, it also collapses every done wave, so the page opens on
// the current wave. The first toggle on the route stores the whole
// list, so a wave that finishes after that toggle stays expanded until
// the person collapses it. `useEpicWavesLoad` reads the `epics.get`
// query that `useTableGroups` and the epic page read, so this sends no
// request of its own.
export const useTableCollapse = (routeKey: string, statuses: readonly Status[], view: View) => {
	const epicRef = hasInlineClosed(view) ? view.epic : undefined;
	const epicRefs = useMemo(() => (epicRef === undefined ? noRefs : [epicRef]), [epicRef]);
	const { epics } = useEpicWavesLoad(epicRefs);
	const defaults = useMemo(
		() => [
			...closedCategories.map((category) => closedKey(statuses, category)).filter((key) => key !== undefined),
			...epics.flatMap((entry) => doneWaveIds(entry.waves)),
		],
		[statuses, epics],
	);
	const collapsed = useCollapsedGroups(routeKey, defaults);
	const expanded = closedCategories.filter((category) => {
		const key = closedKey(statuses, category);
		return key !== undefined && !collapsed.isCollapsed(key);
	});
	return { collapsed, expanded };
};
