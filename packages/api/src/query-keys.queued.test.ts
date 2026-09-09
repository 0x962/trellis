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
import { queryKey, t1, ticket, ulid } from "../test/fixtures.ts";

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
		applier.applyEvent({ type: "comment.created", id: ulid, ticketId: t1 });
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
	// After a description event, the detail keeps its version until a refetch
	// brings the text, or the next save would pass the version check and
	// overwrite the newer text. A refetch that brings the version resumes the
	// patches.
	test("a detail patches again once a refetch brings the version of the description event", () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		applier.applyEvent(updatedEvent(summaryAt(4), ["description"]));
		advanceTo(100);
		applier.applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" }), ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket(summaryAt(3)));
		advanceTo(2000);
		queryClient.setQueryData(detailKey, ticket({ ...summaryAt(5, { title: "Fifth" }), description: "New text" }));
		const v6 = summaryAt(6, { title: "Sixth" });
		applier.applyEvent(updatedEvent(v6, ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...v6, description: "New text" }));
	});
});
