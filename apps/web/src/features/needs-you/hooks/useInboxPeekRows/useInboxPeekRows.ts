import { useMemo } from "react";
import type { PeekRow } from "../../../ticket/TicketPeek/providers/PeekListProvider";
import { useInbox } from "../useInbox";
import { useSectionOpen } from "../useSectionOpen";

// The rows a peek over Needs you walks with j and k, in page order: Review,
// Failing CI, Stalled, then Done by agents today. A row in a closed section
// is not visible, so j and k skip it. Each section key and default state
// must match the `useSectionOpen` call in that section's component.
export const useInboxPeekRows = (): PeekRow[] => {
	const inbox = useInbox().data;
	const review = useSectionOpen("review", true).open;
	const failingCi = useSectionOpen("failingCi", true).open;
	const stalled = useSectionOpen("stalled", true).open;
	const doneByAgentsToday = useSectionOpen("doneByAgentsToday", false).open;
	return useMemo(() => {
		if (inbox === undefined) return [];
		const sections = [
			[inbox.review.items, review],
			[inbox.failingCi.items, failingCi],
			[inbox.stalled.items, stalled],
			[inbox.doneByAgentsToday.items, doneByAgentsToday],
		] as const;
		return sections.flatMap(([items, open]) =>
			items.map((ticket) => ({ identifier: ticket.identifier, visible: open })),
		);
	}, [inbox, review, failingCi, stalled, doneByAgentsToday]);
};
