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

describe("applyEvent during a refetch", () => {
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
