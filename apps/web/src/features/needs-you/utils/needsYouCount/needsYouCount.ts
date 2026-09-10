import type { Inbox } from "@trellis/api";

// How many tickets wait on a person: the distinct tickets of Review and
// Failing checks. Stalled and Done by agents today do not ask for an action,
// so they do not count. A ticket in review with failed checks is in both
// sections and counts once. A section carries at most 100 rows, so the count
// starts from the totals and subtracts the overlap among the loaded rows.
// The sidebar badge, the favicon badge, and the page header show this number.
export const needsYouCount = (inbox: Inbox): number => {
	const review = new Set(inbox.review.items.map((ticket) => ticket.id));
	const overlap = inbox.failingCi.items.filter((ticket) => review.has(ticket.id)).length;
	return inbox.review.total + inbox.failingCi.total - overlap;
};
