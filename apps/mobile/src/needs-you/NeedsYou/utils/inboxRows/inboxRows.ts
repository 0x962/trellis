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
export const badgeCount = (_inbox: Inbox): number => {
	throw new Error("mobile-inbox: badgeCount is not implemented");
};

export const isInboxEmpty = (_inbox: Inbox): boolean => {
	throw new Error("mobile-inbox: isInboxEmpty is not implemented");
};

export const inboxRows = (_inbox: Inbox, _open: OpenSections): InboxItem[] => {
	throw new Error("mobile-inbox: inboxRows is not implemented");
};
