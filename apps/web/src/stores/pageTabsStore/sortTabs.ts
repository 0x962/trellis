export type PageTabSortDirection = "ascending" | "descending";

type NamedTab = { title: string; customTitle?: string };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const visibleTabName = (tab: NamedTab) => tab.customTitle ?? tab.title;

// Tabs that share a region are contiguous in the list. The sort reorders the tabs inside each
// contiguous run of one region and keeps the runs in their original order, so a tab never crosses
// a region boundary. Array.prototype.sort is stable, so tabs with equal names keep their order.
export const sortTabs = <T extends NamedTab>(
	tabs: readonly T[],
	direction: PageTabSortDirection,
	regionOf: (tab: T) => string,
): T[] => {
	const sign = direction === "ascending" ? 1 : -1;
	const compare = (left: T, right: T) => sign * collator.compare(visibleTabName(left), visibleTabName(right));
	const sorted: T[] = [];
	let run: T[] = [];
	let region: string | null = null;
	for (const tab of tabs) {
		const key = regionOf(tab);
		if (region !== null && key !== region) {
			sorted.push(...run.sort(compare));
			run = [];
		}
		region = key;
		run.push(tab);
	}
	sorted.push(...run.sort(compare));
	return sorted;
};
