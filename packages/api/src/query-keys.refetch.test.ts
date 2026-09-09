import { describe, expect, mock, test } from "bun:test";
import { type QueryClient, QueryObserver } from "@tanstack/query-core";
import {
	cached,
	deletedEvent,
	isInvalidated,
	listKey,
	listPage,
	seedTicketCaches,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";

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
		return { queryFn, answer };
	};

	// A refetch that starts before an event can read the rows before the
	// event's commit. The query then holds an older version under
	// `staleTime: Infinity`, and nothing refetches it. So an event for a
	// query that waits on a refetch makes that query refetch again.
	test("an event that arrives during a refetch makes the query refetch again after the event", async () => {
		const { queryClient, advanceTo, applier } = setup(seedTicketCaches(summaryAt(3)));
		const { queryFn, answer } = observeList(queryClient);
		applier.applyEvent(updatedEvent(summaryAt(4), ["status"]));
		advanceTo(250);
		expect(queryFn).toHaveBeenCalledTimes(1);
		applier.applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" }), ["title"]));
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
});
