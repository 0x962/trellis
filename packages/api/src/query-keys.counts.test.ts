import { describe, expect, test } from "bun:test";
import {
	cached,
	countsKey,
	createdEvent,
	deletedEvent,
	isInvalidated,
	observeQuery,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { statusId, t2 } from "../test/fixtures.ts";
import { membershipFields } from "./query-keys.ts";

// A counts result holds no ticket row, so no row version can tell whether
// a fetch read its rows before an event's commit. A membership event
// (a create, a delete, or a change to a field in `membershipFields`)
// during the fetch makes counts refetch at settle. Any other event moves
// no ticket between statuses, so counts stays current.
describe("applyEvent on a counts query whose fetch settles behind a membership event", () => {
	const counts = (total: number) => ({ total, byStatus: [{ statusId, count: total }] });

	// The create's flush at 250 ms dedupes onto the initial fetch, and the
	// fetch's success clears the invalidated flag. So the settle check is
	// what makes counts refetch.
	test("a create during a counts query's initial fetch that lands after the flush makes counts refetch", async () => {
		const { queryClient, advanceTo, applier } = setup(() => {});
		const { queryFn, answer } = observeQuery(queryClient, countsKey);
		expect(queryFn).toHaveBeenCalledTimes(1);
		applier.applyEvent(createdEvent(summaryAt(1, { id: t2, identifier: "CDE-43", number: 43, title: "New" })));
		advanceTo(250);
		expect(queryFn).toHaveBeenCalledTimes(1);
		await answer(0, counts(1));
		expect(queryFn).toHaveBeenCalledTimes(2);
		await answer(1, counts(2));
		expect(cached(queryClient, countsKey)).toEqual(counts(2));
		expect(isInvalidated(queryClient, countsKey)).toBe(false);
	});

	// One case per membership kind. The cases come from the exported
	// `membershipFields` set, so a new field joins them.
	test("every membership event during a counts query's fetch makes counts refetch on settle", async () => {
		const cases = [
			{ kind: "ticket.deleted", event: deletedEvent(summaryAt(4)) },
			...[...membershipFields].map((field) => ({ kind: field, event: updatedEvent(summaryAt(4), [field]) })),
		];
		for (const { kind, event } of cases) {
			const { queryClient, applier } = setup(() => {});
			const { queryFn, answer } = observeQuery(queryClient, countsKey);
			applier.applyEvent(event);
			await answer(0, counts(1));
			expect({ kind, calls: queryFn.mock.calls.length }).toEqual({ kind, calls: 2 });
			expect({ kind, invalidated: isInvalidated(queryClient, countsKey) }).toEqual({ kind, invalidated: true });
			await answer(1, counts(1));
			expect({ kind, invalidated: isInvalidated(queryClient, countsKey) }).toEqual({ kind, invalidated: false });
		}
	});

	test("a title event during a counts query's fetch does not make counts refetch", async () => {
		const { queryClient, applier } = setup(() => {});
		const { queryFn, answer } = observeQuery(queryClient, countsKey);
		applier.applyEvent(updatedEvent(summaryAt(4), ["title"]));
		await answer(0, counts(1));
		expect(queryFn).toHaveBeenCalledTimes(1);
		expect(cached(queryClient, countsKey)).toEqual(counts(1));
		expect(isInvalidated(queryClient, countsKey)).toBe(false);
	});

	// The settle refetches at once. The membership flush at 250 ms cancels
	// that refetch and starts another, as a flush does for any fetch in
	// flight.
	test("a status event during a counts refetch makes counts refetch again at settle", async () => {
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			queryClient.setQueryData(countsKey, counts(1));
		});
		const { queryFn, answer, observer } = observeQuery(queryClient, countsKey);
		void observer.refetch();
		expect(queryFn).toHaveBeenCalledTimes(1);
		applier.applyEvent(updatedEvent(summaryAt(4), ["status"]));
		await answer(0, counts(1));
		expect(queryFn).toHaveBeenCalledTimes(2);
		advanceTo(250);
		expect(queryFn).toHaveBeenCalledTimes(3);
		await answer(2, counts(1));
		expect(cached(queryClient, countsKey)).toEqual(counts(1));
		expect(isInvalidated(queryClient, countsKey)).toBe(false);
	});
});
