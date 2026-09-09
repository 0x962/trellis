import { describe, expect, test } from "bun:test";
import { CancelledError, type QueryClient } from "@tanstack/query-core";
import {
	cached,
	createdEvent,
	deletedEvent,
	detailKey,
	listKey,
	listPage,
	seedTicketCaches,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { queryKey, t1, ticket } from "../test/fixtures.ts";

// A fetch for a ticket that a `ticket.deleted` event names can still be in
// flight. Its result must never land. A result that lands puts the deleted
// row back under the detail key, and the ticket page shows a dead ticket.
describe("applyEvent on ticket.deleted with a fetch in flight", () => {
	const byUlidKey = queryKey(["tickets", "get"], { ticket: t1 });
	const timelineKey = queryKey(["timeline", "list"], { ticket: t1 });
	const prsKey = queryKey(["pullRequests", "list"], { ticket: "cde-42" });

	// The queries left in the cache that name the ticket by input or by the
	// `id` in their data. After a delete this must be empty.
	const queriesFor = (queryClient: QueryClient, id: string, identifier: string) =>
		queryClient
			.getQueryCache()
			.getAll()
			.filter((query) => {
				const input = (query.queryKey[1] as { input?: { ticket?: string } }).input;
				const inputTicket = input?.ticket?.toUpperCase();
				const dataId = (query.state.data as { id?: string } | undefined)?.id;
				return inputTicket === id || inputTicket === identifier || dataId === id;
			})
			.map((query) => query.queryKey);

	// A fetch that answers only when the test resolves it.
	const startFetch = (queryClient: QueryClient, key: unknown[]) => {
		let answer: (value: unknown) => void = () => {};
		const fetch = queryClient.fetchQuery({
			queryKey: key,
			queryFn: () =>
				new Promise<unknown>((resolve) => {
					answer = resolve;
				}),
		});
		return { fetch, answer: (value: unknown) => answer(value) };
	};

	test("a detail fetch by ULID that resolves after the delete never lands, and no query for the id remains", async () => {
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			seedTicketCaches(summaryAt(3))(queryClient);
			queryClient.setQueryData(timelineKey, { items: [], nextCursor: null });
			queryClient.setQueryData(prsKey, []);
		});
		const { fetch, answer } = startFetch(queryClient, byUlidKey);
		applier.applyEvent(deletedEvent(summaryAt(4)));
		answer(ticket(summaryAt(4)));
		await expect(fetch).rejects.toBeInstanceOf(CancelledError);
		advanceTo(5000);
		expect(cached(queryClient, byUlidKey)).toBeUndefined();
		expect(cached(queryClient, detailKey)).toBeUndefined();
		expect(cached(queryClient, listKey)).toEqual(listPage());
		expect(queriesFor(queryClient, t1, "CDE-42")).toEqual([]);
	});

	// query-core answers a cancelled fetch with the data the query held
	// before the fetch. That answer goes to the caller only, never into the
	// cache.
	test("a detail fetch by identifier that resolves after the delete never lands, and no query for the id remains", async () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		const { fetch, answer } = startFetch(queryClient, detailKey);
		applier.applyEvent(deletedEvent(summaryAt(4)));
		answer(ticket(summaryAt(4)));
		await expect(fetch).resolves.toEqual(ticket(summaryAt(3)));
		advanceTo(5000);
		expect(cached(queryClient, detailKey)).toBeUndefined();
		expect(cached(queryClient, listKey)).toEqual(listPage());
		expect(queriesFor(queryClient, t1, "CDE-42")).toEqual([]);
	});
});

// A delete is final. An event for the ticket that arrives after the delete
// is a straggler from before the commit, and it must not rebuild the row.
// The tombstone holds for 60 s, long enough for a reconnect replay.
describe("applyEvent after a ticket.deleted", () => {
	// A fetch that read the rows before the commit can land after the delete
	// and bring the row back. The events that follow must not move that row.
	test("a ticket.updated or ticket.created within 60 s of the delete patches nothing", () => {
		const { queryClient, advanceTo, applier, setQueryData, invalidateQueries } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(deletedEvent(summaryAt(4)));
		advanceTo(2000);
		queryClient.setQueryData(listKey, listPage(summaryAt(3)));
		setQueryData.mockClear();
		invalidateQueries.mockClear();
		advanceTo(59_000);
		applier.applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" }), ["status"]));
		applier.applyEvent(createdEvent(summaryAt(6, { title: "Sixth" })));
		advanceTo(61_000);
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(3)));
		expect(cached(queryClient, detailKey)).toBeUndefined();
		expect(setQueryData).not.toHaveBeenCalled();
		expect(invalidateQueries).not.toHaveBeenCalled();
	});

	test("a ticket.updated 60 s after the delete patches the row again", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(deletedEvent(summaryAt(4)));
		queryClient.setQueryData(listKey, listPage(summaryAt(3)));
		advanceTo(60_000);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		expect(cached(queryClient, listKey)).toEqual(listPage(v5));
	});

	// A mutation sent before the delete can answer after it, and its response
	// writes the row back. The events held behind that mutation apply after
	// settle, and the tombstone drops every one that is not a delete.
	test("a held ticket.updated for a deleted ticket patches nothing after settle", () => {
		const { queryClient, applier, setQueryData } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(deletedEvent(summaryAt(4)));
		applier.beginMutation(t1);
		applier.applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" }), ["title"]));
		queryClient.setQueryData(listKey, listPage(summaryAt(4)));
		setQueryData.mockClear();
		applier.endMutation(t1);
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(4)));
		expect(cached(queryClient, detailKey)).toBeUndefined();
		expect(setQueryData).not.toHaveBeenCalled();
	});
});
