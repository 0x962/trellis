import { generateOperationKey } from "@orpc/tanstack-query";
import { partialMatchKey, type Query, type QueryClient } from "@tanstack/query-core";
import type { Scheduler } from "./scheduler.ts";

// A flush runs 250 ms after the last queued invalidation and at most 1 s
// after the first one, so a constant event stream still refetches once a second.
export const TRAILING_MS = 250;
export const MAX_WAIT_MS = 1000;

// One query family to invalidate. `path` is a prefix of the procedure path
// (`["tickets"]` covers every ticket query). `input` narrows by the query
// input; `dataId` narrows by the `id` inside the cached data, which is how
// a detail keyed by identifier is found by ULID.
export type Matcher = { path: string[]; input?: Record<string, unknown>; dataId?: string };

export const family = (...path: string[]): Matcher => ({ path });

export const byInput = (path: string[], input: Record<string, unknown>): Matcher => ({ path, input });

// The two ways a detail is found: by the `id` in its data when the key holds
// the identifier from the URL, and by input when a sub-resource opened it by ULID.
export const ticketDetail = (id: string): Matcher[] => [
	{ path: ["tickets", "get"], dataId: id },
	byInput(["tickets", "get"], { ticket: id }),
];

const dataId = (query: Query) => (query.state.data as { id?: unknown } | undefined)?.id;

// The matcher key comes from the same builder `@orpc/tanstack-query` uses for
// every query key, so a partial match on `[path, {input}]` finds the entries
// the web app's `queryOptions` created.
const matches = (query: Query, matcher: Matcher) => {
	const key = generateOperationKey(matcher.path, matcher.input === undefined ? {} : { input: matcher.input });
	return partialMatchKey(query.queryKey, key) && (matcher.dataId === undefined || dataId(query) === matcher.dataId);
};

export type InvalidationCoalescer = {
	enqueue: (matchers: Matcher[]) => void;
	invalidateAll: () => void;
};

// Queued matchers flush as one `invalidateQueries` call. `invalidateAll`
// drops the queue, because a full invalidation covers every queued family.
export const createInvalidationCoalescer = (queryClient: QueryClient, scheduler: Scheduler): InvalidationCoalescer => {
	const pending = new Map<string, Matcher>();
	let timer: unknown;
	let firstQueuedAt = 0;

	const flush = () => {
		timer = undefined;
		const matchers = [...pending.values()];
		pending.clear();
		void queryClient.invalidateQueries({ predicate: (query) => matchers.some((matcher) => matches(query, matcher)) });
	};

	const enqueue = (matchers: Matcher[]) => {
		for (const matcher of matchers) pending.set(JSON.stringify(matcher), matcher);
		const now = scheduler.now();
		if (timer === undefined) {
			firstQueuedAt = now;
		} else {
			scheduler.clearTimeout(timer);
		}
		const flushAt = Math.min(now + TRAILING_MS, firstQueuedAt + MAX_WAIT_MS);
		timer = scheduler.setTimeout(flush, flushAt - now);
	};

	const invalidateAll = () => {
		if (timer !== undefined) scheduler.clearTimeout(timer);
		timer = undefined;
		pending.clear();
		void queryClient.invalidateQueries();
	};

	return { enqueue, invalidateAll };
};
