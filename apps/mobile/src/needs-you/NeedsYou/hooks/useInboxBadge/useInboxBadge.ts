import type { QueryClient } from "@tanstack/react-query";
import { useCachedInbox } from "../../utils/inboxCache";
import { badgeCount } from "../../utils/inboxRows";

// The Needs you tab badge from the cached inbox: Review plus Failing CI.
// Zero, and no cached inbox, give no badge. The hook reads the cache only,
// so a tab bar that mounts before the tab never fetches.
export const useInboxBadge = (queryClient: QueryClient): number | undefined => {
	const inbox = useCachedInbox(queryClient);
	if (inbox === undefined) return undefined;
	const count = badgeCount(inbox);
	return count === 0 ? undefined : count;
};
