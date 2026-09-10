import type { Inbox, InboxSection } from "@trellis/api";

// The inbox without the ticket `id`. Every section that held the row loses
// it, and that section's total falls by one with it, so a count never waits
// for the server.
export const dropInboxRow = (inbox: Inbox, id: string): Inbox => {
	const drop = (section: InboxSection): InboxSection => {
		const items = section.items.filter((item) => item.id !== id);
		return { items, total: section.total - (section.items.length - items.length) };
	};
	return {
		review: drop(inbox.review),
		failingCi: drop(inbox.failingCi),
		stalled: drop(inbox.stalled),
		doneByAgentsToday: drop(inbox.doneByAgentsToday),
	};
};
