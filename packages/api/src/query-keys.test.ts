import { describe, expect, test } from "bun:test";
import {
	boardKey,
	boardPage,
	cached,
	createdEvent,
	deletedEvent,
	detailKey,
	isInvalidated,
	listKey,
	listPage,
	seedTicketCaches,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { infiniteQueryKey, queryKey, t1, t2, ticket } from "../test/fixtures.ts";

describe("applyEvent on ticket events", () => {
	test("applyEvent patches every cached list, board, and detail that holds the ticket when the incoming version is higher", () => {
		const { queryClient, advanceTo, applier, setQueryData, invalidateQueries } = setup(seedTicketCaches(summaryAt(3)));
		const v4 = summaryAt(4, { title: "Renamed" });
		applier.applyEvent(updatedEvent(v4));
		expect(cached(queryClient, listKey)).toEqual(listPage(v4));
		expect(cached(queryClient, boardKey)).toEqual(boardPage(v4));
		expect(cached(queryClient, detailKey)).toEqual(ticket(v4));
		expect(setQueryData).toHaveBeenCalledTimes(3);
		advanceTo(2000);
		expect(invalidateQueries).not.toHaveBeenCalled();
	});

	// Events can arrive out of order across a reconnect. A cached row already
	// past the incoming version must not move backwards.
	test("applyEvent drops an event whose version is lower than or equal to the cached version", () => {
		const v3 = summaryAt(3);
		const { queryClient, applier, setQueryData } = setup(seedTicketCaches(v3));
		applier.applyEvent(updatedEvent(summaryAt(3, { title: "Same version" })));
		applier.applyEvent(updatedEvent(summaryAt(2, { title: "Older" })));
		expect(cached(queryClient, listKey)).toEqual(listPage(v3));
		expect(cached(queryClient, boardKey)).toEqual(boardPage(v3));
		expect(cached(queryClient, detailKey)).toEqual(ticket(v3));
		expect(setQueryData).not.toHaveBeenCalled();
	});

	// A mutation writes its own response into the cache when it settles. A
	// patch applied in between would be overwritten by that older response, so
	// patches wait and only the highest version lands after settle.
	test("applyEvent queues patches while a mutation is in flight and applies the highest version after settle", () => {
		const v3 = summaryAt(3);
		const { queryClient, applier, setQueryData } = setup(seedTicketCaches(v3));
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.beginMutation(t1);
		applier.applyEvent(updatedEvent(v5));
		applier.applyEvent(updatedEvent(summaryAt(4, { title: "Fourth" })));
		expect(cached(queryClient, listKey)).toEqual(listPage(v3));
		expect(cached(queryClient, detailKey)).toEqual(ticket(v3));
		expect(setQueryData).not.toHaveBeenCalled();

		applier.endMutation(t1);
		expect(cached(queryClient, listKey)).toEqual(listPage(v5));
		expect(cached(queryClient, boardKey)).toEqual(boardPage(v5));
		expect(cached(queryClient, detailKey)).toEqual(ticket(v5));
		expect(setQueryData).toHaveBeenCalledTimes(3);
	});

	// The held events fold into one: the highest version wins the row, and
	// every field any of them named still counts, so a status change that a
	// later title change supersedes still refetches the filtered lists.
	test("held events keep the fields of every event, so a superseded status change still invalidates", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.beginMutation(t1);
		applier.applyEvent(updatedEvent(summaryAt(4), ["status"]));
		applier.applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" }), ["title"]));
		applier.endMutation(t1);
		advanceTo(2000);
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(5, { title: "Fifth" })));
		expect(isInvalidated(queryClient, listKey)).toBe(true);
	});

	test("a ticket.deleted held behind a mutation still removes the ticket after settle", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.beginMutation(t1);
		applier.applyEvent(updatedEvent(summaryAt(4), ["title"]));
		applier.applyEvent(deletedEvent(summaryAt(4)));
		applier.endMutation(t1);
		advanceTo(2000);
		expect(cached(queryClient, listKey)).toEqual(listPage());
		expect(queryClient.getQueryCache().find({ queryKey: detailKey, exact: true })).toBeUndefined();
		expect(isInvalidated(queryClient, listKey)).toBe(true);
	});

	test("a ticket.deleted event removes the ticket from lists and drops its detail", () => {
		const { queryClient, advanceTo, applier, invalidateQueries } = setup((queryClient) => {
			queryClient.setQueryData(listKey, listPage(summaryAt(3)));
			queryClient.setQueryData(detailKey, ticket(summaryAt(3)));
		});
		applier.applyEvent(deletedEvent(summaryAt(4)));
		expect(cached(queryClient, listKey)).toEqual(listPage());
		expect(queryClient.getQueryCache().find({ queryKey: detailKey, exact: true })).toBeUndefined();
		expect(invalidateQueries).not.toHaveBeenCalled();
		advanceTo(250);
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
	});

	// The QueryClient is shared with every other query the app runs, so a key
	// that is not an oRPC key sits beside the ticket queries.
	test("a cached query with a key that is not an oRPC key is skipped", () => {
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(["theme"], "dark");
			queryClient.setQueryData(listKey, listPage(summaryAt(3)));
		});
		const v4 = summaryAt(4, { title: "Renamed" });
		applier.applyEvent(updatedEvent(v4));
		expect(cached(queryClient, listKey)).toEqual(listPage(v4));
		expect(cached(queryClient, ["theme"])).toBe("dark");
	});

	// A cursor-paged table holds an infinite query: `{pages, pageParams}`, one
	// list page per entry.
	test("an infinite tickets.list entry is patched page by page", () => {
		const pagedKey = infiniteQueryKey(["tickets", "list"], { project: "CDE" });
		const other = summaryAt(1, { id: t2, identifier: "CDE-43", number: 43 });
		const { queryClient, applier } = setup((queryClient) => {
			queryClient.setQueryData(pagedKey, {
				pages: [listPage(other), listPage(summaryAt(3))],
				pageParams: [undefined, "cursor-1"],
			});
		});
		const v4 = summaryAt(4, { title: "Renamed" });
		applier.applyEvent(updatedEvent(v4));
		expect(cached(queryClient, pagedKey)).toEqual({
			pages: [listPage(other), listPage(v4)],
			pageParams: [undefined, "cursor-1"],
		});
		applier.applyEvent(deletedEvent(summaryAt(5)));
		expect(cached(queryClient, pagedKey)).toEqual({
			pages: [listPage(other), listPage()],
			pageParams: [undefined, "cursor-1"],
		});
	});

	// The description lives only on the detail and a summary event does not
	// carry it. A detail that took the new version with the old text would let
	// the next save pass the version check and overwrite the newer text.
	test("a description event leaves the detail at its version and invalidates it", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(updatedEvent(summaryAt(4), ["description"]));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(4)));
		expect(cached(queryClient, detailKey)).toEqual(ticket(summaryAt(3)));
		advanceTo(2000);
		expect(isInvalidated(queryClient, detailKey)).toBe(true);
	});
});

describe("applyEvent on a parent's detail", () => {
	const child = (version: number, overrides: Record<string, unknown> = {}) =>
		summaryAt(version, {
			id: t2,
			identifier: "CDE-43",
			number: 43,
			parent: { id: t1, identifier: "CDE-42" },
			...overrides,
		});
	const parentKey = detailKey;
	const otherParentKey = queryKey(["tickets", "get"], { ticket: "CDE-50" });
	const t3 = "01J8Z6X4Q3M2K1H0G9F8E7D6T3";

	test("a deleted child leaves its parent's children and the parent detail refetches", () => {
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			queryClient.setQueryData(parentKey, ticket({ ...summaryAt(3), childCount: 1, children: [child(3)] }));
		});
		applier.applyEvent(deletedEvent(child(4)));
		expect((cached(queryClient, parentKey) as { children: unknown[] }).children).toEqual([]);
		advanceTo(2000);
		expect(isInvalidated(queryClient, parentKey)).toBe(true);
	});

	test("a created sub-ticket refetches its parent's detail", () => {
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			queryClient.setQueryData(parentKey, ticket(summaryAt(3)));
		});
		applier.applyEvent(createdEvent(child(1)));
		advanceTo(2000);
		expect(isInvalidated(queryClient, parentKey)).toBe(true);
	});

	test("a child that moves to another parent leaves the old parent's children and the new parent refetches", () => {
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			queryClient.setQueryData(parentKey, ticket({ ...summaryAt(3), childCount: 1, children: [child(3)] }));
			queryClient.setQueryData(
				otherParentKey,
				ticket({ ...summaryAt(2, { id: t3, identifier: "CDE-50", number: 50 }) }),
			);
		});
		applier.applyEvent(updatedEvent(child(4, { parent: { id: t3, identifier: "CDE-50" } }), ["parent"]));
		expect((cached(queryClient, parentKey) as { children: unknown[] }).children).toEqual([]);
		advanceTo(2000);
		expect(isInvalidated(queryClient, otherParentKey)).toBe(true);
	});
});
