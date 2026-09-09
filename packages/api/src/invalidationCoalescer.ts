import { generateOperationKey } from "@orpc/tanstack-query";
import type { Query, QueryClient } from "@tanstack/query-core";
import type { Scheduler } from "./scheduler.ts";

// A flush runs `trailingMs` after the last queued invalidation. It runs at
// most `maxWaitMs` after the first one, so a constant event stream still
// refetches. The general queue flushes at 250 ms and at most 1 s. The inbox
// queue is slower: its query runs four sections, so it debounces 1 s.
export const TRAILING_MS = 250;
export const MAX_WAIT_MS = 1000;
export const INBOX_TRAILING_MS = 1000;
export const INBOX_MAX_WAIT_MS = 4000;

export type CoalescerTiming = { trailingMs: number; maxWaitMs: number };

// One query family to invalidate. `path` is a prefix of the procedure path:
// `["tickets"]` covers every ticket query. `input` narrows by the query
// input. `dataId` narrows by the `id` inside the cached data. `ticket`
// narrows by the `ticket` input, given as the ULID or as the identifier.
export type Matcher = { path: string[]; input?: Record<string, unknown>; dataId?: string; ticket?: string };

export const family = (...path: string[]): Matcher => ({ path });

export const byInput = (path: string[], input: Record<string, unknown>): Matcher => ({ path, input });

// A sub-resource query names its ticket in `input.ticket`. The ticket page
// opens it by the identifier from the URL, and a list row opens it by ULID.
// `forTicket` matches both spellings of one ticket.
export const forTicket = (path: string[], id: string): Matcher => ({ path, ticket: id });

// A detail keyed by the identifier from the URL matches on the `id` in its
// data. A detail that a query opened by ULID matches on its input.
export const ticketDetail = (id: string): Matcher[] => [
	{ path: ["tickets", "get"], dataId: id },
	forTicket(["tickets", "get"], id),
];

// The matcher for one cached query: its own path and input. An oRPC key is
// `[path, {input?, type?}]`, and the `type` is left out, so a query and its
// infinite variant with the same input match together.
export const forQuery = (query: Query): Matcher => ({
	path: query.queryKey[0] as string[],
	input: (query.queryKey[1] as { input?: Record<string, unknown> }).input,
});

const dataId = (query: Query) => (query.state.data as { id?: unknown } | undefined)?.id;

// A ticket ref's canonical spelling is upper-case, for a ULID and for a
// `KEY-n` identifier alike. A query key holds the ref as the URL or the
// caller spelled it, so the input is upper-cased before every comparison.
const inputTicket = (query: Query) => (query.queryKey[1] as { input: { ticket: string } }).input.ticket.toUpperCase();

// The matcher key comes from the builder `@orpc/tanstack-query` uses for
// every query key. So `findAll` on `[path, {input}]` gives the entries the
// web app's `queryOptions` created, with a partial match on the input.
const operationKey = (matcher: Matcher) =>
	generateOperationKey(matcher.path, matcher.input === undefined ? {} : { input: matcher.input });

// The identifier of every ticket whose detail the cache holds, by ULID. An
// event names a ticket by ULID only. A sub-resource query keyed by the
// identifier exists only while the cache holds the detail that opened it.
export const ticketIdentifiers = (queryClient: QueryClient) => {
	const identifiers = new Map<string, string>();
	for (const query of queryClient.getQueryCache().findAll({ queryKey: operationKey(family("tickets", "get")) })) {
		const data = query.state.data as { id: string; identifier: string } | undefined;
		if (data !== undefined) identifiers.set(data.id, data.identifier);
	}
	return identifiers;
};

const matchingQueries = (queryClient: QueryClient, matcher: Matcher, identifiers: Map<string, string>) => {
	const queries = queryClient.getQueryCache().findAll({ queryKey: operationKey(matcher) });
	if (matcher.dataId !== undefined) return queries.filter((query) => dataId(query) === matcher.dataId);
	if (matcher.ticket === undefined) return queries;
	const identifier = identifiers.get(matcher.ticket);
	return queries.filter((query) => {
		const ticket = inputTicket(query);
		return ticket === matcher.ticket || ticket === identifier;
	});
};

export type InvalidationCoalescer = {
	enqueue: (matchers: Matcher[]) => void;
	pendingQueries: (identifiers: Map<string, string>) => Set<Query>;
	invalidateAll: () => void;
};

// Queued matchers flush as one `invalidateQueries` call, and a flush that
// covers no cached query makes no call. `pendingQueries` names every cached
// query the queue covers, so a patch does not land on a query that is about
// to refetch. It scans the cache once per queued matcher, so a caller builds
// the identifier map once and asks once per event. `invalidateAll` drops the
// queue, because a full invalidation covers every queued family.
export const createInvalidationCoalescer = (
	queryClient: QueryClient,
	scheduler: Scheduler,
	timing: CoalescerTiming = { trailingMs: TRAILING_MS, maxWaitMs: MAX_WAIT_MS },
): InvalidationCoalescer => {
	const pending = new Map<string, Matcher>();
	let timer: unknown;
	let firstQueuedAt = 0;

	const coveredQueries = (identifiers: Map<string, string>) =>
		new Set([...pending.values()].flatMap((matcher) => matchingQueries(queryClient, matcher, identifiers)));

	const flush = () => {
		timer = undefined;
		const targets = coveredQueries(ticketIdentifiers(queryClient));
		pending.clear();
		if (targets.size === 0) return;
		void queryClient.invalidateQueries({ predicate: (query) => targets.has(query) });
	};

	const enqueue = (matchers: Matcher[]) => {
		for (const matcher of matchers) pending.set(JSON.stringify(matcher), matcher);
		const now = scheduler.now();
		if (timer === undefined) {
			firstQueuedAt = now;
		} else {
			scheduler.clearTimeout(timer);
		}
		const flushAt = Math.min(now + timing.trailingMs, firstQueuedAt + timing.maxWaitMs);
		timer = scheduler.setTimeout(flush, flushAt - now);
	};

	const pendingQueries = (identifiers: Map<string, string>) =>
		pending.size === 0 ? new Set<Query>() : coveredQueries(identifiers);

	const invalidateAll = () => {
		if (timer !== undefined) scheduler.clearTimeout(timer);
		timer = undefined;
		pending.clear();
		void queryClient.invalidateQueries();
	};

	return { enqueue, pendingQueries, invalidateAll };
};
