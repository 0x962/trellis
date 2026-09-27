import { redirect } from "@tanstack/react-router";
import { parseProjectSplat } from "../../../lib/projectUrl";
import { useUiStore } from "../../../stores/uiStore";
import { parseSearch, type View } from "../../filters/grammar";
import { epicPageSearch, epicUrlSearch, isCanonicalEpicSearch } from "../epicSearch";

const filtersOf = ({ epic, tab, sort, group, density, limit, ...filters }: Partial<View>) => filters;

type Input = {
	splat: string;
	search: Partial<View>;
	searchStr: string;
	cause: "enter" | "stay" | "preload";
	preload: boolean;
	phone: boolean;
};

// An entry without URL filters restores the epic's device preferences.
// A change within the open epic saves the URL filters, including an empty set.
export function loadEpicFilterSearch({ splat, search, searchStr, cause, preload, phone }: Input) {
	const { ref, epic } = parseProjectSplat(splat);
	if (epic === undefined) {
		if (!preload && useUiStore.getState().activeEpicFilters !== null) useUiStore.setState({ activeEpicFilters: null });
		return;
	}
	const key = `${ref.toUpperCase()}/${epic}`;
	const store = useUiStore.getState();
	const filters = filtersOf(search);
	const restore = (cause !== "stay" || store.activeEpicFilters !== key) && Object.keys(filters).length === 0;
	const selected = restore ? { ...filtersOf(parseSearch(store.epicFilters[key] ?? {})), ...search } : search;
	if (!isCanonicalEpicSearch(searchStr, selected, phone)) {
		throw redirect({
			to: "/p/$",
			params: { _splat: splat },
			search: epicUrlSearch(epicPageSearch(selected, "", phone), phone),
			replace: true,
		});
	}
	if (!preload) {
		useUiStore.setState({ activeEpicFilters: key });
		store.setEpicFilters(key, filtersOf(selected));
	}
}
