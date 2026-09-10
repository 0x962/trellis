import { describe, expect, test } from "bun:test";
import {
	boardKey,
	boardPage,
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

// A change at the cached version patches nothing, so the patch alone cannot
// say whether the query held the row. The record reads the row's presence
// instead. A cached row that the result lacks marks the query behind, at
// the cached version as at a higher one.
describe("applyEvent on a query whose fetch settles without a row the cache holds at the event's version", () => {
	const v5 = summaryAt(5, { title: "Fifth" });

	test("a list whose result lacks the row after an event at the cached version refetches", async () => {
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(listKey, listPage(v5));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, listKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(v5, ["title"]));
		await answer(0, listPage());
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, listPage(v5));
		expect(cached(queryClient, listKey)).toEqual(listPage(v5));
		expect(isInvalidated(queryClient, listKey)).toBe(false);
	});

	test("a board whose result lacks the row after an event at the cached version refetches", async () => {
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(boardKey, boardPage(v5));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, boardKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(v5, ["title"]));
		await answer(0, boardPage());
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, boardPage(v5));
		expect(cached(queryClient, boardKey)).toEqual(boardPage(v5));
		expect(isInvalidated(queryClient, boardKey)).toBe(false);
	});

	test("an inbox whose result lacks the row after an event at the cached version refetches", async () => {
		const section = (...items: Summary[]) => ({ review: { items, total: items.length } });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(inboxKey, section(v5));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, inboxKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(v5, ["title"]));
		await answer(0, section());
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, section(v5));
		expect(cached(queryClient, inboxKey)).toEqual(section(v5));
		expect(isInvalidated(queryClient, inboxKey)).toBe(false);
	});

	test("a detail whose result lacks a child after an event at the cached version refetches", async () => {
		const child = summaryAt(5, { id: t2, identifier: "CDE-43", number: 43, parent: { id: t1, identifier: "CDE-42" } });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(detailKey, ticket({ ...summaryAt(3), children: [child] }));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, detailKey);
		void observer.refetch();
		applier.applyEvent(updatedEvent(child, ["title"]));
		await answer(0, ticket(summaryAt(3)));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, ticket({ ...summaryAt(3), children: [child] }));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...summaryAt(3), children: [child] }));
		expect(isInvalidated(queryClient, detailKey)).toBe(false);
	});
});

// A result can hold one id in more than one place. An infinite list holds
// a row per page. A board holds a row per column while a status change is
// in flight. An inbox holds a row per section. The settle check compares
// every row, so one row below the recorded version marks the query behind.
// A deleted row leaves every place before the refetch.
describe("applyEvent on a query whose settled result holds one id in two places", () => {
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

	// The refetch reads both sections before the delete's commit. The
	// second copy has nothing left to patch, so the patch of the first copy
	// stands and the result lands empty. The cache never shows the row.
	test("an inbox whose two sections hold a deleted row after the delete refetches and never shows it", async () => {
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(inboxKey, twoSections([summaryAt(3)], [summaryAt(3)]));
		});
		const { queryFn, answer, observer, seen } = observeQuery(queryClient, inboxKey);
		void observer.refetch();
		applier.applyEvent(deletedEvent(summaryAt(3)));
		expect(cached(queryClient, inboxKey)).toEqual(twoSections([], []));
		await answer(0, twoSections([summaryAt(3)], [summaryAt(3)]));
		expect(cached(queryClient, inboxKey)).toEqual(twoSections([], []));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, twoSections([], []));
		expect(isInvalidated(queryClient, inboxKey)).toBe(false);
		const sectionIds = (data: unknown) =>
			Object.values(data as Record<string, { items: { id: string }[] }>).flatMap((s) => s.items.map((row) => row.id));
		expect(seen.flatMap(sectionIds)).not.toContain(t1);
	});

	test("an infinite list whose two pages hold a deleted row after the delete refetches and never shows it", async () => {
		const page1 = (...rows: Summary[]) => ({ ...listPage(...rows), nextCursor: "c1" });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(infiniteListKey, {
				pages: [page1(summaryAt(3)), listPage(summaryAt(3))],
				pageParams: [null, "c1"],
			});
		});
		const { queryFn, answerPage, observer } = observeInfiniteQuery(queryClient, infiniteListKey);
		void observer.refetch();
		applier.applyEvent(deletedEvent(summaryAt(3)));
		await answerPage(0, page1(summaryAt(3)));
		await answerPage(1, listPage(summaryAt(3)));
		expect(cached(queryClient, infiniteListKey)).toEqual({ pages: [page1(), listPage()], pageParams: [null, "c1"] });
		expect(queryFn).toHaveBeenCalledTimes(3);
		await answerPage(2, page1());
		await answerPage(3, listPage());
		expect(cached(queryClient, infiniteListKey)).toEqual({ pages: [page1(), listPage()], pageParams: [null, "c1"] });
		expect(isInvalidated(queryClient, infiniteListKey)).toBe(false);
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

	// A delete is final. A search is keyed by free text, so the delete
	// never removes it and never invalidates it. When the refetch read the
	// row before the delete's commit, the settle check is the only place
	// that removes the row, and the search refetches.
	test("a search whose cache lacked a deleted row that the result holds drops the row and refetches", async () => {
		const searchKey = queryKey(["search", "query"], { q: "first" });
		const rowIds = (data: unknown) => (data as { tickets: { id: string }[] }).tickets.map((row) => row.id);
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(searchKey, searchPage(other(3)));
		});
		const { queryFn, answer, observer, seen } = observeQuery(queryClient, searchKey);
		void observer.refetch();
		applier.applyEvent(deletedEvent(summaryAt(4)));
		expect(cached(queryClient, searchKey)).toEqual(searchPage(other(3)));
		await answer(0, searchPage(other(3), summaryAt(4)));
		expect(cached(queryClient, searchKey)).toEqual(searchPage(other(3)));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, searchPage(other(3)));
		expect(cached(queryClient, searchKey)).toEqual(searchPage(other(3)));
		expect(isInvalidated(queryClient, searchKey)).toBe(false);
		expect(seen.flatMap(rowIds)).not.toContain(t1);
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
