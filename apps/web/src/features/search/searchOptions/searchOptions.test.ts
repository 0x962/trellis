import { expect, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import type { SearchOutput, SearchQueryInput, TrellisClient } from "@trellis/api";
import { searchOptions } from "./searchOptions";

test("loads past 50 matches and resets the offset for a different query or preferred project", async () => {
	const calls: SearchQueryInput[] = [];
	const client = {
		search: {
			query: async (input: SearchQueryInput): Promise<SearchOutput> => {
				calls.push(input);
				const offset = Number(input.offset);
				return {
					tickets: [],
					pages: [],
					projects: [],
					nextOffset: offset < 40 ? offset + 20 : null,
				};
			},
		},
	} as TrellisClient;
	const orpc = createTanstackQueryUtils(client);
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const observer = new InfiniteQueryObserver(queryClient, searchOptions(orpc, "first"));
	await observer.refetch();
	await observer.fetchNextPage();
	await observer.fetchNextPage();
	expect(observer.getCurrentResult().data?.pageParams).toEqual([0, 20, 40]);
	expect(observer.getCurrentResult().hasNextPage).toBe(false);
	observer.setOptions(searchOptions(orpc, "second"));
	await observer.refetch();
	expect(observer.getCurrentResult().data?.pageParams).toEqual([0]);
	observer.setOptions(searchOptions(orpc, "second", "TRL"));
	await observer.refetch();
	expect(observer.getCurrentResult().data?.pageParams).toEqual([0]);
	expect(calls.map(({ q, offset, rankProject }) => [q, offset, rankProject])).toEqual([
		["first", 0, undefined],
		["first", 20, undefined],
		["first", 40, undefined],
		["second", 0, undefined],
		["second", 0, "TRL"],
	]);
	observer.destroy();
	queryClient.clear();
});
