export type PageTabSortDirection = "ascending" | "descending";

type NamedTab = { title: string; customTitle?: string };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const visibleTabName = (tab: NamedTab) => tab.customTitle ?? tab.title;

// The caller must keep tabs with the same regionOf value together.
// Array.prototype.sort preserves the order of names that compare as equal.
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
