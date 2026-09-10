import { useCallback } from "react";
import { uiActions, useUiStore } from "../../../../stores/uiStore";

// The collapse state of a route's groups. A route with no stored entry
// collapses `defaults`, the Done and Canceled groups; the first toggle
// writes the whole list.
export const useCollapsedGroups = (routeKey: string, defaults: readonly string[]) => {
	const stored = useUiStore((state) => state.collapsedGroups[routeKey]);
	const collapsed = stored ?? defaults;
	const isCollapsed = useCallback((key: string) => collapsed.includes(key), [collapsed]);
	const toggle = useCallback(
		(key: string) => uiActions.toggleGroup(routeKey, key, [...defaults]),
		[routeKey, defaults],
	);
	return { isCollapsed, toggle };
};
