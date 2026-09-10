import type { Inbox } from "@trellis/api";

// How many rows Needs you holds. The sidebar badge shows this number, and
// the page header shows it beside the title.
export const needsYouCount = (inbox: Inbox): number =>
	inbox.review.total + inbox.failingCi.total + inbox.stalled.total + inbox.doneByAgentsToday.total;
