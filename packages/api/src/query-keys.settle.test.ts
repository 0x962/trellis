import { describe, expect, test } from "bun:test";
import {
	boardKey,
	cached,
	createdEvent,
	deletedEvent,
	detailKey,
	inboxKey,
	isInvalidated,
	listKey,
	listPage,
	observeInfiniteQuery,
	observeQuery,
	type Summary,
	searchPage,
	seedTicketCaches,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { infiniteQueryKey, queryKey, statusId, t1, t2, ticket } from "../test/fixtures.ts";
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

// A result can hold one id in more than one place: a row per page of an
// infinite list, a row per board column while a status change is in
// flight, or a row per inbox section. The settle check compares every
// row, so one row below the recorded version marks the query behind.
describe("applyEvent on a query whose settled result holds one id at two versions", () => {
	const infiniteListKey = infiniteQueryKey(["tickets", "list"], { project: "CDE" });
	const status2 = "01J8Z6X4Q3M2K1H0G9F8E7D6S2";
	const v5 = summaryAt(5, { title: "Fifth" });
	const twoColumns = (first: Summary[], second: Summary[]) => ({
		columns: [
			{ statusId, count: first.length, items: first },
			{ statusId: status2, count: second.length, items: second },
		],
	});
	const twoSections = (review: Summary[], failingCi: Summary[]) => ({
		review: { items: review, total: review.length },
		failingCi: { items: failingCi, total: failingCi.length },
	});

	// The refetch reads page 1 before the event's commit and page 2 after
	// it. The version 3 row on page 1 marks the query behind, and the
	// settle refetches every page.
	test("an infinite list whose pages hold the row at versions 3 and 5 after a version 5 event refetches", async () => {
		const page1 = (row: Summary) => ({ ...listPage(row), nextCursor: "c1" });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(infiniteListKey, {
				pages: [page1(summaryAt(3)), listPage(summaryAt(3))],
				pageParams: [null, "c1"],
			});
		});
		const { queryFn, answerPage, observer } = observeInfiniteQuery(queryClient, infiniteListKey);
		void observer.refetch();
		expect(queryFn).toHaveBeenCalledTimes(1);
		applier.applyEvent(updatedEvent(v5, ["title"]));
		await answerPage(0, page1(summaryAt(3)));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answerPage(1, listPage(v5));
		expect(queryFn).toHaveBeenCalledTimes(3);
		await answerPage(2, page1(v5));
		expect(queryFn).toHaveBeenCalledTimes(4);
		await answerPage(3, listPage(v5));
		expect(cached(queryClient, infiniteListKey)).toEqual({
			pages: [page1(v5), listPage(v5)],
			pageParams: [null, "c1"],
		});
		expect(isInvalidated(queryClient, infiniteListKey)).toBe(false);
	});

	test("a board whose columns hold the row at versions 3 and 5 after a version 5 event refetches", async () => {
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(boardKey, twoColumns([summaryAt(3)], []));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, boardKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(v5, ["status"]));
		await answer(0, twoColumns([summaryAt(3)], [v5]));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, twoColumns([], [v5]));
		expect(cached(queryClient, boardKey)).toEqual(twoColumns([], [v5]));
		expect(isInvalidated(queryClient, boardKey)).toBe(false);
	});

	test("an inbox whose sections hold the row at versions 3 and 5 after a version 5 event refetches", async () => {
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(inboxKey, twoSections([summaryAt(3)], []));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, inboxKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(v5, ["title"]));
		await answer(0, twoSections([summaryAt(3)], [v5]));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, twoSections([], [v5]));
		expect(cached(queryClient, inboxKey)).toEqual(twoSections([], [v5]));
		expect(isInvalidated(queryClient, inboxKey)).toBe(false);
	});

	// The check reads every item. A current last item never hides a
	// first item that is behind.
	test("a search whose first item is behind and whose last item is current after two version 5 events refetches", async () => {
		const searchKey = queryKey(["search", "query"], { q: "first" });
		const second = (version: number) => summaryAt(version, { id: t2, identifier: "CDE-43", number: 43 });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(searchKey, searchPage(summaryAt(3), second(3)));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, searchKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(v5, ["title"]));
		applier.applyEvent(updatedEvent(second(5), ["title"]));
		await answer(0, searchPage(summaryAt(3), second(5)));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, searchPage(v5, second(5)));
		expect(cached(queryClient, searchKey)).toEqual(searchPage(v5, second(5)));
		expect(isInvalidated(queryClient, searchKey)).toBe(false);
	});
});

// A row the cache lacks has nothing to patch, so the patch returns
// undefined. The fetch can still read that row before the event's commit.
// So the event is recorded for the query, and the settle check finds the
// row below its recorded version.
describe("applyEvent on a query whose cache lacks the row its fetch reads", () => {
	const other = (version: number, overrides: Record<string, unknown> = {}) =>
		summaryAt(version, { id: t2, identifier: "CDE-43", number: 43, ...overrides });

	test("a row the cached page lacked that the fetch read before the patch makes the list refetch", async () => {
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(listKey, listPage(summaryAt(3)));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, listKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(other(5, { title: "Fifth" }), ["title"]));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(3)));
		await answer(0, listPage(summaryAt(3), other(3)));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, listPage(summaryAt(3), other(5, { title: "Fifth" })));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(3), other(5, { title: "Fifth" })));
		expect(isInvalidated(queryClient, listKey)).toBe(false);
	});

	test("a child the cached detail lacked that the fetch read before the patch makes the detail refetch", async () => {
		const child = (version: number) => other(version, { parent: { id: t1, identifier: "CDE-42" } });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(detailKey, ticket(summaryAt(3)));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, detailKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(child(5), ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket(summaryAt(3)));
		await answer(0, ticket({ ...summaryAt(3), children: [child(3)] }));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, ticket({ ...summaryAt(3), children: [child(5)] }));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...summaryAt(3), children: [child(5)] }));
		expect(isInvalidated(queryClient, detailKey)).toBe(false);
	});

	// A row absent from the cache and from the result does not belong to
	// this list, so the settle refetches nothing.
	test("a row absent from both the cached page and the result does not make the list refetch", async () => {
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(listKey, listPage(summaryAt(3)));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, listKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(other(5, { title: "Fifth" }), ["title"]));
		await answer(0, listPage(summaryAt(3)));
		expect(queryFn).toHaveBeenCalledTimes(1);
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(3)));
		expect(isInvalidated(queryClient, listKey)).toBe(false);
	});
});
