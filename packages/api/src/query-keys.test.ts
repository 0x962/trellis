import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/query-core";
import {
	boardKey,
	boardPage,
	cached,
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
import { infiniteQueryKey, t1, t2, ticket } from "../test/fixtures.ts";
import { applyEvent, eventApplierFor } from "./query-keys.ts";

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

	// The held events fold into one. The highest version wins the row, and
	// every field any of them named still counts. So a status change that a
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
	// carry it. The detail takes the event's version and keeps the old text,
	// with `descriptionStale` set. The editor refuses to save while the flag
	// is set, so the old text can never go back under the new version.
	test("a description event patches the detail, marks its description stale, and invalidates it", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(updatedEvent(summaryAt(4), ["description"]));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(4)));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...summaryAt(4), descriptionStale: true }));
		advanceTo(2000);
		expect(isInvalidated(queryClient, detailKey)).toBe(true);
	});

	// A description event older than the cached detail applies nothing. The
	// text the detail holds is at least as new as the event's, so the flag
	// stays clear and no refetch is queued.
	test("a stale description event leaves the detail untouched and queues no refetch", () => {
		const { queryClient, advanceTo, applier, invalidateQueries } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(updatedEvent(summaryAt(2), ["description"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket(summaryAt(3)));
		advanceTo(2000);
		expect(invalidateQueries).not.toHaveBeenCalled();
	});

	// Patch first, always. A later event without the description patches the
	// summary fields at its own version, and the stale flag stays set until
	// a refetch replaces the entry. An invalidated detail takes the patch too.
	test("a detail with a stale description takes every later patch and keeps the flag", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(updatedEvent(summaryAt(4), ["description"]));
		advanceTo(100);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...v5, descriptionStale: true }));
		expect(cached(queryClient, listKey)).toEqual(listPage(v5));
		advanceTo(2000);
		expect(isInvalidated(queryClient, detailKey)).toBe(true);
		const v6 = summaryAt(6, { title: "Sixth" });
		applier.applyEvent(updatedEvent(v6, ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...v6, descriptionStale: true }));
		expect(cached(queryClient, listKey)).toEqual(listPage(v6));
		advanceTo(4000);
		expect(isInvalidated(queryClient, detailKey)).toBe(true);
	});
});

describe("applyEvent with the shared applier", () => {
	// The web app calls `applyEvent(event, queryClient)` from its SSE handler
	// and `beginMutation` from its mutations. Both must reach one applier per
	// QueryClient, or a held event lands during the mutation.
	test("applyEvent uses the applier eventApplierFor returns, so a mutation holds its events", () => {
		const queryClient = new QueryClient();
		seedTicketCaches(summaryAt(3))(queryClient);
		const applier = eventApplierFor(queryClient);
		expect(eventApplierFor(queryClient)).toBe(applier);
		applier.beginMutation(t1);
		applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" })), queryClient);
		expect(cached(queryClient, detailKey)).toEqual(ticket(summaryAt(3)));
		applier.endMutation(t1);
		expect(cached(queryClient, detailKey)).toEqual(ticket(summaryAt(5, { title: "Fifth" })));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(5, { title: "Fifth" })));
	});
});
