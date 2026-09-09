import { describe, expect, test } from "bun:test";
import type { QueryClient } from "@tanstack/query-core";
import { cached, deletedEvent, isInvalidated, listPage, searchPage, setup, summaryAt } from "../test/applierHarness.ts";
import { queryKey, t1, t2 } from "../test/fixtures.ts";

// A delete removes only the queries whose input names the ticket in a ref
// field. Free text that spells the identifier is a search term, not a ref,
// and the query it belongs to still answers after the delete.
describe("applyEvent on ticket.deleted with the ticket's spelling in a query input", () => {
	const inCache = (queryClient: QueryClient, key: unknown[]) =>
		queryClient.getQueryCache().find({ queryKey: key, exact: true }) !== undefined;

	test("a search whose q spells the identifier is patched, not removed", () => {
		const searchKey = queryKey(["search", "query"], { q: "CDE-42" });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(searchKey, searchPage(summaryAt(3)));
		});
		applier.applyEvent(deletedEvent(summaryAt(4)));
		expect(inCache(queryClient, searchKey)).toBe(true);
		expect(cached(queryClient, searchKey)).toEqual(searchPage());
	});

	test("a list whose q spells the identifier in lower case is patched, not removed", () => {
		const listByTextKey = queryKey(["tickets", "list"], { q: "cde-42" });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(listByTextKey, listPage(summaryAt(3)));
		});
		applier.applyEvent(deletedEvent(summaryAt(4)));
		expect(inCache(queryClient, listByTextKey)).toBe(true);
		expect(cached(queryClient, listByTextKey)).toEqual(listPage());
	});

	// The children of a deleted parent change on the server, so the list
	// that filters by that parent refetches with the other lists.
	test("a list filtered by the ticket as parent is invalidated, not removed", () => {
		const childrenKey = queryKey(["tickets", "list"], { parent: t1 });
		const child = summaryAt(3, { id: t2, identifier: "CDE-43", number: 43, parent: { id: t1, identifier: "CDE-42" } });
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			queryClient.setQueryData(childrenKey, listPage(child));
		});
		applier.applyEvent(deletedEvent(summaryAt(4)));
		expect(inCache(queryClient, childrenKey)).toBe(true);
		expect(cached(queryClient, childrenKey)).toEqual(listPage(child));
		advanceTo(2000);
		expect(isInvalidated(queryClient, childrenKey)).toBe(true);
	});
});
