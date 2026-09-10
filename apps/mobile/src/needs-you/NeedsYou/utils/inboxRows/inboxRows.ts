import type { Inbox, TicketSummary } from "@trellis/api";

export type SectionKey = keyof Inbox;

// Which sections are open. A closed section shows its header only.
export type OpenSections = Record<SectionKey, boolean>;

// One FlashList item. `type` is what `getItemType` returns, so a header
// and a row never share a recycled view.
export type InboxItem =
	| { type: "header"; key: SectionKey; total: number }
	| { type: "row"; key: SectionKey; ticket: TicketSummary };

// The section order on the screen.
export const sectionOrder: readonly SectionKey[] = ["review", "failingCi", "stalled", "doneByAgentsToday"];

// The tab badge: Review plus Failing CI, the two sections that need a person.
export const badgeCount = (inbox: Inbox): number => inbox.review.total + inbox.failingCi.total;

export const isInboxEmpty = (inbox: Inbox): boolean => sectionOrder.every((key) => inbox[key].total === 0);

// The header of every section in order, each followed by its rows when the
// section is open. A section holds at most 100 rows; its header carries the
// whole total.
export const inboxRows = (inbox: Inbox, open: OpenSections): InboxItem[] =>
	sectionOrder.flatMap((key): InboxItem[] => {
		const section = inbox[key];
		const header: InboxItem = { type: "header", key, total: section.total };
		if (!open[key]) return [header];
		return [header, ...section.items.map((ticket): InboxItem => ({ type: "row", key, ticket }))];
	});
