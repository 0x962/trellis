import { generateOperationKey } from "@orpc/tanstack-query";
import { partialMatchKey, type Query, type QueryClient } from "@tanstack/query-core";
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
	byInput(["tickets", "get"], { ticket: id }),
];

const dataId = (query: Query) => (query.state.data as { id?: unknown } | undefined)?.id;

const isDetail = (query: Query) => partialMatchKey(query.queryKey, generateOperationKey(["tickets", "get"]));

// The identifier of every ticket whose detail the cache holds, by ULID. An
// event names a ticket by ULID only. A sub-resource query keyed by the
// identifier exists only while the cache holds the detail that opened it.
const ticketIdentifiers = (queryClient: QueryClient) => {
	const identifiers = new Map<string, string>();
	for (const query of queryClient.getQueryCache().getAll()) {
		const data = query.state.data as { id: string; identifier: string } | undefined;
		if (data !== undefined && isDetail(query)) identifiers.set(data.id, data.identifier);
	}
	return identifiers;
};

const inputTicket = (query: Query) =>
	(query.queryKey[1] as { input?: { ticket?: unknown } } | undefined)?.input?.ticket;

// The matcher key comes from the builder `@orpc/tanstack-query` uses for
// every query key. So a partial match on `[path, {input}]` finds the entries
// the web app's `queryOptions` created.
const matches = (query: Query, matcher: Matcher, identifiers: Map<string, string>) => {
	const key = generateOperationKey(matcher.path, matcher.input === undefined ? {} : { input: matcher.input });
	if (!partialMatchKey(query.queryKey, key)) return false;
	if (matcher.dataId !== undefined && dataId(query) !== matcher.dataId) return false;
	if (matcher.ticket === undefined) return true;
	const ticket = inputTicket(query);
	return ticket === matcher.ticket || ticket === identifiers.get(matcher.ticket);
};

export type InvalidationCoalescer = {
	enqueue: (matchers: Matcher[]) => void;
	isPending: (query: Query) => boolean;
	invalidateAll: () => void;
};

// Queued matchers flush as one `invalidateQueries` call. `isPending` tells
// whether a query waits in the queue, so a patch does not land on a query
// that is about to refetch. `invalidateAll` drops the queue, because a full
// invalidation covers every queued family.
export const createInvalidationCoalescer = (
	queryClient: QueryClient,
	scheduler: Scheduler,
	timing: CoalescerTiming = { trailingMs: TRAILING_MS, maxWaitMs: MAX_WAIT_MS },
): InvalidationCoalescer => {
	const pending = new Map<string, Matcher>();
	let timer: unknown;
	let firstQueuedAt = 0;

	const flush = () => {
		timer = undefined;
		const matchers = [...pending.values()];
		pending.clear();
		const identifiers = ticketIdentifiers(queryClient);
		void queryClient.invalidateQueries({
			predicate: (query) => matchers.some((matcher) => matches(query, matcher, identifiers)),
		});
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

	const isPending = (query: Query) => {
		if (pending.size === 0) return false;
		const identifiers = ticketIdentifiers(queryClient);
		return [...pending.values()].some((matcher) => matches(query, matcher, identifiers));
	};

	const invalidateAll = () => {
		if (timer !== undefined) scheduler.clearTimeout(timer);
		timer = undefined;
		pending.clear();
		void queryClient.invalidateQueries();
	};

	return { enqueue, isPending, invalidateAll };
};
