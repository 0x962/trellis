import { describe, expect, test } from "bun:test";
import {
	cached,
	createdEvent,
	deletedEvent,
	detailKey,
	isInvalidated,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { queryKey, t1, t2, ticket } from "../test/fixtures.ts";

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
		expect(isInvalidated(queryClient, parentKey)).toBe(true);
	});

	// The server bumps only the child's version, so nothing else repairs the
	// old parent's `childCount`.
	test("a child that loses its parent leaves the old parent's children and the old parent refetches", () => {
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			queryClient.setQueryData(parentKey, ticket({ ...summaryAt(3), childCount: 1, children: [child(3)] }));
		});
		applier.applyEvent(updatedEvent(child(4, { parent: null }), ["parent"]));
		expect((cached(queryClient, parentKey) as { children: unknown[] }).children).toEqual([]);
		advanceTo(2000);
		expect(isInvalidated(queryClient, parentKey)).toBe(true);
	});

	// `childDoneCount` lives on the parent row and the parent emits no event of
	// its own, so the parent's detail refetches when a child completes.
	test("a child's status change patches the parent's children row and refetches the parent's counts", () => {
		const { queryClient, advanceTo, applier } = setup((queryClient) => {
			queryClient.setQueryData(parentKey, ticket({ ...summaryAt(3), childCount: 1, children: [child(3)] }));
		});
		const done = child(4, {
			status: { ...child(4).status, category: "done" },
			completedAt: "2026-09-09T11:00:00.000Z",
		});
		applier.applyEvent(updatedEvent(done, ["status", "completedAt"]));
		expect((cached(queryClient, parentKey) as { children: unknown[] }).children).toEqual([done]);
		advanceTo(2000);
		expect(isInvalidated(queryClient, parentKey)).toBe(true);
	});

	// Events can arrive out of order across a reconnect. A parent change that
	// is older than the cached child row must not remove that row.
	test("a stale parent change leaves a newer child row in place", () => {
		const { queryClient, applier, setQueryData } = setup((queryClient) => {
			queryClient.setQueryData(parentKey, ticket({ ...summaryAt(3), childCount: 1, children: [child(5)] }));
		});
		applier.applyEvent(updatedEvent(child(4, { parent: null }), ["parent"]));
		expect((cached(queryClient, parentKey) as { children: unknown[] }).children).toEqual([child(5)]);
		expect(setQueryData).not.toHaveBeenCalled();
	});
});
