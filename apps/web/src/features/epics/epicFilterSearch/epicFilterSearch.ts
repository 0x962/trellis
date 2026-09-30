import { redirect } from "@tanstack/react-router";
import { parseProjectSplat } from "../../../lib/projectUrl";
import { useUiStore } from "../../../stores/uiStore";
import { parseSearch, type View } from "../../filters/grammar";
import { epicPageSearch, epicUrlSearch, isCanonicalEpicSearch } from "../epicSearch";

const filtersOf = ({ epic, tab, sort, group, limit, ...filters }: Partial<View>) => filters;

type Input = {
	splat: string;
	search: Partial<View>;
	searchStr: string;
	cause: "enter" | "stay" | "preload";
	preload: boolean;
	phone: boolean;
};

// An empty filter set restores saved filters after a page load or an epic switch, but clears filters on the same epic.
export function syncEpicFilterSearch({ splat, search, searchStr, cause, preload, phone }: Input) {
	if (preload) return;
	const { ref, epic } = parseProjectSplat(splat);
	if (epic === undefined) {
		if (useUiStore.getState().activeEpicFilterKey !== null) useUiStore.setState({ activeEpicFilterKey: null });
		return;
	}
	const epicFilterKey = `${ref.toUpperCase()}/${epic}`;
	const store = useUiStore.getState();
	const filters = filtersOf(search);
	const entering = cause !== "stay" || store.activeEpicFilterKey !== epicFilterKey;
	const restore = entering && Object.keys(filters).length === 0;
	const selected = restore ? { ...filtersOf(parseSearch(store.epicFilters[epicFilterKey] ?? {})), ...search } : search;
	const sort =
		entering && search.sort === undefined ? parseSearch({ sort: store.epicSorts[epicFilterKey] }).sort : search.sort;
	const canonical = epicUrlSearch(epicPageSearch({ ...selected, sort }, "", phone), phone);
	// Save the selected order before a redirect removes an explicit default from the URL.
	useUiStore.setState({ activeEpicFilterKey: epicFilterKey });
	store.setEpicFilters(epicFilterKey, filtersOf(canonical));
	store.setEpicSort(epicFilterKey, canonical.sort ?? "number");
	if (!isCanonicalEpicSearch(searchStr, canonical, phone)) {
		throw redirect({
			to: "/p/$",
			params: { _splat: splat },
			search: canonical,
			replace: true,
		});
	}
}
