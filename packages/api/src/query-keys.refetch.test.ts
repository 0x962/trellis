import { describe, expect, mock, test } from "bun:test";
import { type QueryClient, QueryObserver } from "@tanstack/query-core";
import {
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
import { ticket } from "../test/fixtures.ts";

// An active list whose queryFn answers only when the test says so. Each
// call gets its own promise, so the test controls the order of the
// answers against the events.
const observeList = (queryClient: QueryClient) => {
	const answers: ((value: unknown) => void)[] = [];
	const queryFn = mock(() => new Promise<unknown>((resolve) => answers.push(resolve)));
	const observer = new QueryObserver(queryClient, { queryKey: listKey, queryFn, staleTime: Infinity });
	observer.subscribe(() => {});
	const answer = async (index: number, value: unknown) => {
		answers[index]!(value);
		await queryClient.getQueryCache().find({ queryKey: listKey, exact: true })!.promise;
	};
	return { queryFn, answer, observer };
};

describe("applyEvent during a refetch", () => {
	// A query whose refetch is in flight takes the patch, and the refetch's
	// result replaces it. That refetch can read the rows before the event's
	// commit, and then the query holds an older version under
	// `staleTime: Infinity`. So the query refetches once more after the event.
	test("an event that arrives during a refetch patches the query and makes it refetch again", async () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		const { queryFn, answer } = observeList(queryClient);
		applier.applyEvent(updatedEvent(summaryAt(4), ["status"]));
		advanceTo(250);
		expect(queryFn).toHaveBeenCalledTimes(1);
		applier.applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" }), ["title"]));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(5, { title: "Fifth" })));
		await answer(0, listPage(summaryAt(4)));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(4)));
		advanceTo(500);
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, listPage(summaryAt(5, { title: "Fifth" })));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(5, { title: "Fifth" })));
		expect(isInvalidated(queryClient, listKey)).toBe(false);
	});

	test("a ticket.deleted that arrives during a refetch makes the list refetch again, so the row leaves", async () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		const { queryFn, answer } = observeList(queryClient);
		applier.applyEvent(updatedEvent(summaryAt(4), ["status"]));
		advanceTo(250);
		expect(queryFn).toHaveBeenCalledTimes(1);
		applier.applyEvent(deletedEvent(summaryAt(4)));
		await answer(0, listPage(summaryAt(4)));
		advanceTo(500);
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, listPage());
		expect(cached(queryClient, listKey)).toEqual(listPage());
	});

	// A refetch that an observer or `refetchQueries` starts leaves
	// `isInvalidated` false. The event's patch lands during that refetch, and
	// the result can carry rows read before the event's commit. So the query
	// refetches once more, the same as after an invalidation.
	test("an event during a refetch that an observer started makes the query refetch again", async () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		const { queryFn, answer, observer } = observeList(queryClient);
		void observer.refetch();
		expect(queryFn).toHaveBeenCalledTimes(1);
		expect(isInvalidated(queryClient, listKey)).toBe(false);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		expect(cached(queryClient, listKey)).toEqual(listPage(v5));
		await answer(0, listPage(summaryAt(3)));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(3)));
		advanceTo(500);
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, listPage(v5));
		expect(cached(queryClient, listKey)).toEqual(listPage(v5));
		advanceTo(2000);
		expect(queryFn).toHaveBeenCalledTimes(2);
	});
});

describe("applyEvent on a query whose fetch settles later", () => {
	// A query can lose its observer while its refetch is in flight, and the
	// result can still carry rows read before the event's commit. No
	// observer means no refetch now. The query is marked invalidated at
	// settle, so its next mount refetches.
	test("a query that loses its observer during a refetch is invalidated at settle and refetches on its next mount", async () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		const { queryFn, answer, observer } = observeList(queryClient);
		void observer.refetch();
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		observer.destroy();
		advanceTo(250);
		await answer(0, listPage(summaryAt(3)));
		expect(cached(queryClient, listKey)).toEqual(listPage(summaryAt(3)));
		advanceTo(5250);
		expect(queryFn).toHaveBeenCalledTimes(1);
		expect(isInvalidated(queryClient, listKey)).toBe(true);
		const remounted = new QueryObserver(queryClient, { queryKey: listKey, queryFn, staleTime: Infinity });
		remounted.subscribe(() => {});
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, listPage(v5));
		const rows = (cached(queryClient, listKey) as { items: { version: number }[] }).items;
		expect(rows[0]!.version).toBeGreaterThanOrEqual(5);
	});

	// A detail can mount while the ticket changes. Its first result can be
	// the row read before the event's commit, and there is no data to patch.
	// The event's version is kept for the query, so the first result is
	// checked at settle and the detail refetches.
	test("an event during a detail's initial fetch makes the detail refetch after its first result", async () => {
		const { queryClient, applier } = setup(() => {});
		const answers: ((value: unknown) => void)[] = [];
		const queryFn = mock(() => new Promise<unknown>((resolve) => answers.push(resolve)));
		const observer = new QueryObserver(queryClient, { queryKey: detailKey, queryFn, staleTime: Infinity });
		observer.subscribe(() => {});
		expect(queryFn).toHaveBeenCalledTimes(1);
		const v5 = summaryAt(5, { title: "Fifth" });
		applier.applyEvent(updatedEvent(v5, ["title"]));
		expect(cached(queryClient, detailKey)).toBeUndefined();
		answers[0]!(ticket(summaryAt(3)));
		await queryClient.getQueryCache().find({ queryKey: detailKey, exact: true })!.promise;
		expect(queryFn).toHaveBeenCalledTimes(2);
		answers[1]!(ticket(v5));
		await queryClient.getQueryCache().find({ queryKey: detailKey, exact: true })!.promise;
		expect((cached(queryClient, detailKey) as { version: number }).version).toBeGreaterThanOrEqual(5);
	});
});

describe("applyEvent on a detail that refetches for its description", () => {
	// A detail with a stale description takes the patch during its refetch.
	// A refetch that started before a later event can bring the text at the
	// description's version and miss that event. So the detail refetches
	// once more, and the second result carries the text and the version.
	test("a title event during the detail's refetch patches the detail and makes it refetch again", async () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		const answers: ((value: unknown) => void)[] = [];
		const queryFn = mock(() => new Promise<unknown>((resolve) => answers.push(resolve)));
		const observer = new QueryObserver(queryClient, { queryKey: detailKey, queryFn, staleTime: Infinity });
		observer.subscribe(() => {});
		applier.applyEvent(updatedEvent(summaryAt(4), ["description"]));
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...summaryAt(4), descriptionStale: true }));
		advanceTo(250);
		expect(queryFn).toHaveBeenCalledTimes(1);
		applier.applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" }), ["title"]));
		expect(cached(queryClient, detailKey)).toEqual(
			ticket({ ...summaryAt(5, { title: "Fifth" }), descriptionStale: true }),
		);
		answers[0]!(ticket({ ...summaryAt(4), description: "New text" }));
		await queryClient.getQueryCache().find({ queryKey: detailKey, exact: true })!.promise;
		expect(cached(queryClient, detailKey)).toEqual(ticket({ ...summaryAt(4), description: "New text" }));
		advanceTo(500);
		expect(queryFn).toHaveBeenCalledTimes(2);
		answers[1]!(ticket({ ...summaryAt(5, { title: "Fifth" }), description: "New text" }));
		await queryClient.getQueryCache().find({ queryKey: detailKey, exact: true })!.promise;
		expect(cached(queryClient, detailKey)).toEqual(
			ticket({ ...summaryAt(5, { title: "Fifth" }), description: "New text" }),
		);
	});
});
