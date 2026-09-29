import type { PageTabItem } from "../../PageTabs";

export const moveKeys = ["ArrowLeft", "ArrowRight", "Home", "End"] as const;

// The tab that a keyboard move of the active tab lands before, or null for
// the end of its region. Undefined means the key moves nothing: the tab
// already sits at that edge of its region, which spans `regionStart` to
// `regionEnd` in `tabs`.
export const moveTargetForKey = (
	key: string,
	tabs: readonly PageTabItem[],
	activeIndex: number,
	regionStart: number,
	regionEnd: number,
): string | null | undefined => {
	const targets: Record<string, string | null | undefined> = {
		ArrowLeft: activeIndex > regionStart ? tabs[activeIndex - 1]!.id : undefined,
		ArrowRight: activeIndex < regionEnd ? (tabs[activeIndex + 2]?.id ?? null) : undefined,
		Home: activeIndex > regionStart ? tabs[regionStart]!.id : undefined,
		End: activeIndex < regionEnd ? (tabs[regionEnd + 1]?.id ?? null) : undefined,
	};
	return targets[key];
};
