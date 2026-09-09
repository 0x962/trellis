import { spyOn } from "bun:test";
import { QueryClient } from "@tanstack/query-core";
import { createEventApplier } from "../src/query-keys.ts";
import { createFakeScheduler } from "./fakeScheduler.ts";
import { queryKey, statusId, ticket, ticketSummary, ulid } from "./fixtures.ts";

// The keys and the cache seeds the applier tests share. The detail is keyed
// by the identifier from the URL and matched by the `id` in its data.
// Sub-resource queries (timeline, prs, attachments) are opened from a loaded
// detail, so their keys carry the ticket's ULID and the applier matches them
// by input.
export const listKey = queryKey(["tickets", "list"], { project: "CDE" });
export const boardKey = queryKey(["tickets", "board"], { project: "CDE" });
export const countsKey = queryKey(["tickets", "counts"], { project: "CDE" });
export const inboxKey = queryKey(["inbox", "get"], { project: "CDE" });
export const detailKey = queryKey(["tickets", "get"], { ticket: "CDE-42" });
export const healthKey = queryKey(["system", "health"]);

export type Summary = ReturnType<typeof ticketSummary>;

export const summaryAt = (version: number, overrides: Record<string, unknown> = {}) =>
	ticketSummary({ version, ...overrides });

export const updatedEvent = (summary: Summary, fields: string[] = ["title"]) => ({
	type: "ticket.updated" as const,
	summary,
	fields,
	batchId: ulid,
});

export const createdEvent = (summary: Summary) => ({
	type: "ticket.created" as const,
	summary,
	fields: [],
	batchId: ulid,
});

export const deletedEvent = (summary: Summary) => ({
	type: "ticket.deleted" as const,
	summary,
	fields: [],
	batchId: ulid,
});

export const listPage = (...items: Summary[]) => ({ items, nextCursor: null });

export const boardPage = (...items: Summary[]) => ({ columns: [{ statusId, count: items.length, items }] });

export const isInvalidated = (queryClient: QueryClient, key: unknown[]) =>
	queryClient.getQueryState(key)?.isInvalidated === true;

export const cached = (queryClient: QueryClient, key: unknown[]): unknown => queryClient.getQueryData(key);

// Seeds the cache, then installs the spies, so seeding never counts as a call.
export const setup = (seed: (queryClient: QueryClient) => void) => {
	const queryClient = new QueryClient();
	seed(queryClient);
	const { scheduler, advanceTo } = createFakeScheduler();
	const applier = createEventApplier(queryClient, { scheduler });
	const setQueryData = spyOn(queryClient, "setQueryData");
	const invalidateQueries = spyOn(queryClient, "invalidateQueries");
	return { queryClient, advanceTo, applier, setQueryData, invalidateQueries };
};

export const seedTicketCaches = (summary: Summary) => (queryClient: QueryClient) => {
	queryClient.setQueryData(listKey, listPage(summary));
	queryClient.setQueryData(boardKey, boardPage(summary));
	queryClient.setQueryData(detailKey, ticket(summary));
};
