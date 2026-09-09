import { describe, expect, test } from "bun:test";
import {
	cached,
	createdEvent,
	deletedEvent,
	isInvalidated,
	listKey,
	listPage,
	observeQuery,
	searchPage,
	seedTicketCaches,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { queryKey, t1, t2, ticket } from "../test/fixtures.ts";
import type { Ticket } from "./schemas/ticket.ts";

// A fetch's result can carry rows read before the commit of an event that
// arrived during the fetch. The settle check compares every row of the
// result against the events recorded during the fetch, and the query
// refetches when the result is behind.
describe("applyEvent on a query whose fetch settles behind the events", () => {
	const searchKey = queryKey(["search", "query"], { q: "first" });
	const rowIds = (data: unknown) => (data as { tickets: { id: string }[] }).tickets.map((row) => row.id);

	// The list has no data to patch, so the event's version is recorded.
	// The first result lacks the row, because the page was read before the
	// commit. A row that an event named and the result lacks makes the
	// list refetch, so the row lands.
	test("an update during a list's initial fetch whose result lacks the row makes the list refetch", async () => {
		const { queryClient, applier } = setup(() => {});
		const { queryFn, answer } = observeQuery(queryClient, listKey);
		expect(queryFn).toHaveBeenCalledTimes(1);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		await answer(0, listPage());
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, listPage(v5));
		expect(cached(queryClient, listKey)).toEqual(listPage(v5));
		expect(isInvalidated(queryClient, listKey)).toBe(false);
	});

	// The create's invalidation flushes at 250 ms while the initial fetch
	// is in flight. A query with no data dedupes that refetch onto the
	// fetch in flight, and the fetch's success clears the invalidated flag.
	// So the settle check is what makes the list refetch.
	test("a create during a list's initial fetch that lands after the flush makes the list refetch", async () => {
		const { queryClient, advanceTo, applier } = setup(() => {});
		const { queryFn, answer } = observeQuery(queryClient, listKey);
		const created = summaryAt(1, { id: t2, identifier: "CDE-43", number: 43, title: "New" });
		applier.applyEvent(createdEvent(created));
		advanceTo(250);
		expect(queryFn).toHaveBeenCalledTimes(1);
		await answer(0, listPage());
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, listPage(created));
		expect(cached(queryClient, listKey)).toEqual(listPage(created));
		expect(isInvalidated(queryClient, listKey)).toBe(false);
	});

	// A search is keyed by free text, so a delete never removes it. Its
	// refetch can land the deleted row at the delete's own version. The
	// row leaves the result before any subscriber reads it, the search
	// refetches, and the mutation's response for the deleted id applies
	// nothing.
	test("a search refetch that lands the deleted row at the delete's version during a mutation never shows it", async () => {
		const { queryClient, applier } = setup((queryClient) => {
			seedTicketCaches(summaryAt(3))(queryClient);
			queryClient.setQueryData(searchKey, searchPage(summaryAt(3)));
		});
		const { queryFn, answer, observer, seen } = observeQuery(queryClient, searchKey);
		void observer.refetch();
		expect(queryFn).toHaveBeenCalledTimes(1);
		applier.beginMutation(t1);
		applier.applyEvent(deletedEvent(summaryAt(3)));
		expect(cached(queryClient, searchKey)).toEqual(searchPage());
		await answer(0, searchPage(summaryAt(3)));
		expect(cached(queryClient, searchKey)).toEqual(searchPage());
		expect(queryFn).toHaveBeenCalledTimes(2);
		applier.endMutation(t1, ticket(summaryAt(3)) as Ticket);
		await answer(1, searchPage());
		expect(cached(queryClient, searchKey)).toEqual(searchPage());
		expect(isInvalidated(queryClient, searchKey)).toBe(false);
		expect(seen.flatMap(rowIds)).not.toContain(t1);
	});
});
