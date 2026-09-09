import { mock, spyOn } from "bun:test";
import { InfiniteQueryObserver, notifyManager, QueryClient, QueryObserver } from "@tanstack/query-core";
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

export const searchPage = (...tickets: Summary[]) => ({ tickets, projects: [] });

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

// An active query whose queryFn answers only when the test says so. Each
// call gets its own promise, so the test controls the order of the answers
// against the events. `seen` holds every data value a React subscriber
// renders. React ignores the value the listener gets and reads the
// observer's current result after the batch, so the helper reads it the
// same way. The listeners run on a timer of zero, so `answer` waits one
// timer tick after the fetch's promise.
export const observeQuery = (queryClient: QueryClient, key: unknown[]) => {
	const answers: ((value: unknown) => void)[] = [];
	const queryFn = mock(() => new Promise<unknown>((resolve) => answers.push(resolve)));
	const observer = new QueryObserver(queryClient, { queryKey: key, queryFn, staleTime: Infinity });
	const seen: unknown[] = [];
	observer.subscribe(notifyManager.batchCalls(() => seen.push(observer.getCurrentResult().data)));
	const answer = async (index: number, value: unknown) => {
		answers[index]!(value);
		await queryClient.getQueryCache().find({ queryKey: key, exact: true })!.promise;
		await new Promise((resolve) => setTimeout(resolve, 0));
	};
	return { queryFn, answer, observer, seen };
};

// An active infinite query whose queryFn answers only when the test says
// so. A refetch fetches every cached page in turn, so one promise answers
// one page, and the next page's call follows the answer after one timer
// tick. The first page's param is null, and each later page's param is the
// previous page's `nextCursor`.
export const observeInfiniteQuery = (queryClient: QueryClient, key: unknown[]) => {
	const answers: ((value: unknown) => void)[] = [];
	const queryFn = mock(() => new Promise<unknown>((resolve) => answers.push(resolve)));
	const observer = new InfiniteQueryObserver(queryClient, {
		queryKey: key,
		queryFn,
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage: unknown) => (lastPage as { nextCursor: string | null }).nextCursor,
		staleTime: Infinity,
	});
	observer.subscribe(() => {});
	const answerPage = async (index: number, value: unknown) => {
		answers[index]!(value);
		await new Promise((resolve) => setTimeout(resolve, 0));
	};
	return { queryFn, answerPage, observer };
};
