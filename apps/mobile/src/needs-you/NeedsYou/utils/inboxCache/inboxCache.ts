import { generateOperationKey } from "@orpc/tanstack-query";
import type { QueryClient } from "@tanstack/react-query";
import type { Inbox, InboxGetInput, TicketSummary } from "@trellis/api";
import { useSyncExternalStore } from "react";
import { type SectionKey, sectionOrder } from "../inboxRows";

// The one inbox the tab reads: every project.
export const inboxInput: InboxGetInput = {};

// The key `orpc.inbox.get.queryOptions({ input: inboxInput })` builds. The
// tab bar reads the cache under it without a client of its own.
export const inboxQueryKey = generateOperationKey(["inbox", "get"], { type: "query", input: inboxInput });

// The cached inbox, re-read after every cache change. The snapshot is the
// data reference, so a render happens only when the entry changes.
export const useCachedInbox = (queryClient: QueryClient): Inbox | undefined =>
	useSyncExternalStore(
		(onChange) => queryClient.getQueryCache().subscribe(onChange),
		() => queryClient.getQueryData<Inbox>(inboxQueryKey),
	);

// Where one ticket sat before `dropInboxRow` took it out: the section and
// the index in each section that held it.
export type DroppedRow = { ticket: TicketSummary; places: Array<{ key: SectionKey; index: number }> };

// Removes the ticket from every section that holds it and lowers each total
// by one. Returns nothing when no section holds the ticket.
export const dropInboxRow = (queryClient: QueryClient, id: string): DroppedRow | undefined => {
	const inbox = queryClient.getQueryData<Inbox>(inboxQueryKey);
	if (inbox === undefined) return undefined;
	const places: DroppedRow["places"] = [];
	let ticket: TicketSummary | undefined;
	const next = { ...inbox };
	for (const key of sectionOrder) {
		const section = inbox[key];
		const index = section.items.findIndex((item) => item.id === id);
		if (index < 0) continue;
		ticket = section.items[index]!;
		places.push({ key, index });
		next[key] = { items: section.items.toSpliced(index, 1), total: section.total - 1 };
	}
	if (ticket === undefined) return undefined;
	queryClient.setQueryData<Inbox>(inboxQueryKey, next);
	return { ticket, places };
};

// Puts a dropped ticket back where it sat, with the summary the server holds
// now. A section that already holds the ticket keeps its row.
export const restoreInboxRow = (queryClient: QueryClient, dropped: DroppedRow, ticket: TicketSummary) => {
	const inbox = queryClient.getQueryData<Inbox>(inboxQueryKey);
	if (inbox === undefined) return;
	const next = { ...inbox };
	for (const { key, index } of dropped.places) {
		const section = next[key];
		if (section.items.some((item) => item.id === ticket.id)) continue;
		const at = Math.min(index, section.items.length);
		next[key] = { items: section.items.toSpliced(at, 0, ticket), total: section.total + 1 };
	}
	queryClient.setQueryData<Inbox>(inboxQueryKey, next);
};
