import { describe, expect, test } from "bun:test";
import {
	boardKey,
	boardPage,
	cached,
	detailKey,
	inboxKey,
	isInvalidated,
	listKey,
	listPage,
	seedTicketCaches,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { commentEvent, queryKey, t1, ticket } from "../test/fixtures.ts";

// Patch first, always. A queued invalidation covers a query for up to 1 s,
// and the inbox for up to 4 s. Every event in that window still patches
// the row, so a burst of events never leaves a row behind. The queued
// invalidation still fires.
describe("applyEvent while an invalidation waits", () => {
	const searchKey = queryKey(["search", "query"], { q: "first" });
	const inboxSection = (...items: ReturnType<typeof summaryAt>[]) => ({
		review: { items, total: items.length },
		failingCi: { items: [], total: 0 },
	});
	const seedEveryCache = (queryClient: Parameters<ReturnType<typeof seedTicketCaches>>[0]) => {
		seedTicketCaches(summaryAt(3))(queryClient);
		queryClient.setQueryData(inboxKey, inboxSection(summaryAt(3)));
		queryClient.setQueryData(searchKey, { tickets: [summaryAt(3)], projects: [] });
	};

	test("a title event patches every cached list, board, inbox section, search result, and detail while a status invalidation waits", () => {
		const { queryClient, advanceTo, applier, invalidateQueries } = setup(seedEveryCache);
		applier.applyEvent(updatedEvent(summaryAt(4), ["status"]));
		advanceTo(100);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		expect(cached(queryClient, listKey)).toEqual(listPage(v5));
		expect(cached(queryClient, boardKey)).toEqual(boardPage(v5));
		expect(cached(queryClient, inboxKey)).toEqual(inboxSection(v5));
		expect(cached(queryClient, searchKey)).toEqual({ tickets: [v5], projects: [] });
		expect(cached(queryClient, detailKey)).toEqual(ticket(v5));
		expect(invalidateQueries).not.toHaveBeenCalled();
		advanceTo(350);
		expect(isInvalidated(queryClient, listKey)).toBe(true);
		expect(isInvalidated(queryClient, boardKey)).toBe(true);
		advanceTo(1100);
		expect(isInvalidated(queryClient, inboxKey)).toBe(true);
	});

	test("a title event patches the detail while a comment invalidation waits for it", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(commentEvent("comment.created"));
		advanceTo(50);
		const v4 = summaryAt(4, { title: "Fourth" });
		applier.applyEvent(updatedEvent(v4, ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket(v4));
		expect(cached(queryClient, listKey)).toEqual(listPage(v4));
		advanceTo(300);
		expect(isInvalidated(queryClient, detailKey)).toBe(true);
	});

	test("an inbox row follows every status event of a 3 s stream while its 4 s invalidation waits", () => {
		const { queryClient, advanceTo, applier } = setup(seedEveryCache);
		for (let at = 0; at <= 3000; at += 100) {
			advanceTo(at);
			const version = 4 + at / 100;
			applier.applyEvent(updatedEvent(summaryAt(version), ["status"]));
			expect(
				(cached(queryClient, inboxKey) as ReturnType<typeof inboxSection>).review.items[0]!.version,
				`t=${at}`,
			).toBe(version);
		}
		expect(isInvalidated(queryClient, inboxKey)).toBe(false);
		advanceTo(4000);
		expect(isInvalidated(queryClient, inboxKey)).toBe(true);
	});

	// The detail holds the description and a summary event does not carry it.
	// After a description event the detail carries `descriptionStale` until a
	// refetch replaces the whole entry. The refetch's row has no flag, so the
	// replacement clears it, and later patches keep it clear.
	test("a refetch clears the stale flag and later patches keep it clear", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(updatedEvent(summaryAt(4), ["description"]));
		advanceTo(100);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...v5, descriptionStale: true }));
		advanceTo(2000);
		queryClient.setQueryData(detailKey, ticket({ ...v5, description: "New text" }));
		const v6 = summaryAt(6, { title: "Sixth" });
		applier.applyEvent(updatedEvent(v6, ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...v6, description: "New text" }));
	});

	// Patch first, always, for the detail too. A title event after a
	// description event moves the detail to its own version. The stale flag
	// stays set, so a save from that detail is refused until the refetch.
	test("a title event patches a detail with a stale description at the event's version", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(updatedEvent(summaryAt(4), ["description"]));
		advanceTo(100);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...v5, descriptionStale: true }));
		expect(isInvalidated(queryClient, detailKey)).toBe(false);
		advanceTo(2000);
		expect(isInvalidated(queryClient, detailKey)).toBe(true);
	});

	// The cache can hold one ticket's detail under two keys: the identifier
	// from the URL and the ULID from a list row. A mutation response refreshes
	// one of them at the event's version, so the held event applies nothing
	// there and sets no flag. The other entry is older, takes the patch, and
	// carries the flag until its own refetch.
	test("a second cached detail of the same ticket goes stale on its own after the first refreshes", () => {
		const byUlidKey = queryKey(["tickets", "get"], { ticket: t1 });
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			seedTicketCaches(summaryAt(3))(queryClient);
			queryClient.setQueryData(byUlidKey, ticket(summaryAt(3)));
		});
		applier.beginMutation(t1);
		applier.applyEvent(updatedEvent(summaryAt(4), ["description"]));
		queryClient.setQueryData(detailKey, ticket({ ...summaryAt(4), description: "New text" }));
		applier.endMutation(t1);
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...summaryAt(4), description: "New text" }));
		expect(cached(queryClient, byUlidKey)).toEqual(ticket({ ...summaryAt(4), descriptionStale: true }));
		advanceTo(100);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...v5, description: "New text" }));
		expect(cached(queryClient, byUlidKey)).toEqual(ticket({ ...v5, descriptionStale: true }));
		advanceTo(2000);
		expect(isInvalidated(queryClient, detailKey)).toBe(false);
		expect(isInvalidated(queryClient, byUlidKey)).toBe(true);
		queryClient.setQueryData(byUlidKey, ticket({ ...v5, description: "New text" }));
		const v6 = summaryAt(6, { title: "Sixth" });
		applier.applyEvent(updatedEvent(v6, ["title"]));
		expect(cached(queryClient, byUlidKey)).toEqual(ticket({ ...v6, description: "New text" }));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...v6, description: "New text" }));
	});
});
