import { describe, expect, test } from "bun:test";
import type { QueryClient } from "@tanstack/query-core";
import {
	boardKey,
	boardPage,
	countsKey,
	detailKey,
	healthKey,
	inboxKey,
	isInvalidated,
	listKey,
	listPage,
	setup,
	summaryAt,
	updatedEvent,
} from "../test/applierHarness.ts";
import { projectId, queryKey, statusId, t1, t2, ticket, ulid } from "../test/fixtures.ts";

describe("invalidation", () => {
	const filteredListKey = queryKey(["tickets", "list"], { status: ["in-progress"], parent: "none" });

	const seedMembershipCaches = (queryClient: QueryClient) => {
		const v3 = summaryAt(3);
		queryClient.setQueryData(filteredListKey, listPage(v3));
		queryClient.setQueryData(boardKey, boardPage(v3));
		queryClient.setQueryData(countsKey, { total: 1, byStatus: [{ statusId, count: 1 }] });
		queryClient.setQueryData(inboxKey, { review: { items: [], total: 0 } });
		queryClient.setQueryData(detailKey, ticket(v3));
		queryClient.setQueryData(healthKey, { ok: true });
	};

	const membershipKeys = [filteredListKey, boardKey, countsKey, inboxKey];

	// A patch keeps a row current, but a filtered list cannot know whether the
	// row still belongs to it after a status, project, priority, parent, or
	// completion change. Only those fields, and create or delete, refetch.
	test("only membership-changing fields and create or delete events enqueue an invalidation", () => {
		const cases = [
			{ name: "status", event: updatedEvent(summaryAt(4), ["status"]), invalidates: true },
			{ name: "title", event: updatedEvent(summaryAt(4), ["title"]), invalidates: false },
			{
				name: "created",
				event: {
					type: "ticket.created" as const,
					summary: summaryAt(1, { id: t2, identifier: "CDE-43", number: 43 }),
					fields: [],
					batchId: ulid,
				},
				invalidates: true,
			},
		];
		for (const { name, event, invalidates } of cases) {
			const { queryClient, advanceTo, applier, invalidateQueries } = setup(seedMembershipCaches);
			applier.applyEvent(event);
			expect(invalidateQueries, `${name} fired at t=0`).not.toHaveBeenCalled();
			advanceTo(1000);
			for (const key of membershipKeys) {
				expect(isInvalidated(queryClient, key), `${name} ${JSON.stringify(key[0])}`).toBe(invalidates);
			}
			expect(isInvalidated(queryClient, detailKey), `${name} detail`).toBe(false);
			expect(isInvalidated(queryClient, healthKey), `${name} health`).toBe(false);
		}
	});

	// One flush is one `invalidateQueries` call that covers every queued key,
	// so the call count is the flush count.
	test("the coalescer folds three invalidations within 250 ms into one trailing call", () => {
		const { advanceTo, applier, invalidateQueries } = setup(seedMembershipCaches);
		for (const [at, version] of [
			[0, 4],
			[100, 5],
			[200, 6],
		] as const) {
			advanceTo(at);
			applier.applyEvent(updatedEvent(summaryAt(version), ["status"]));
		}
		advanceTo(449);
		expect(invalidateQueries).not.toHaveBeenCalled();
		advanceTo(450);
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
		advanceTo(5000);
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
	});

	test("the coalescer forces one invalidation at 1 s under a constant event stream", () => {
		const { advanceTo, applier, invalidateQueries } = setup(seedMembershipCaches);
		for (let at = 0; at <= 1500; at += 100) {
			advanceTo(at);
			applier.applyEvent(updatedEvent(summaryAt(4 + at / 100), ["status"]));
			expect(invalidateQueries, `t=${at}`).toHaveBeenCalledTimes(at >= 1000 ? 1 : 0);
		}
		advanceTo(1749);
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
		advanceTo(1750);
		expect(invalidateQueries).toHaveBeenCalledTimes(2);
		advanceTo(5000);
		expect(invalidateQueries).toHaveBeenCalledTimes(2);
	});

	const prsKey = (id: string) => queryKey(["pullRequests", "list"], { ticket: id });
	const attachmentsKey = (id: string) => queryKey(["attachments", "list"], { ticket: id });
	const timelineKey = (id: string) => queryKey(["timeline", "list"], { ticket: id });
	const statusesKey = queryKey(["statuses", "list"], { project: "CDE" });
	const projectsListKey = queryKey(["projects", "list"]);
	const projectKey = queryKey(["projects", "get"], { project: "CDE" });
	const ghKey = queryKey(["system", "gh"]);

	const seedResourceCaches = (queryClient: QueryClient) => {
		queryClient.setQueryData(detailKey, ticket(summaryAt(3)));
		queryClient.setQueryData(listKey, listPage(summaryAt(3)));
		for (const id of [t1, t2]) {
			queryClient.setQueryData(prsKey(id), []);
			queryClient.setQueryData(attachmentsKey(id), []);
			queryClient.setQueryData(timelineKey(id), { items: [], nextCursor: null });
		}
		queryClient.setQueryData(statusesKey, { statuses: [], inheritedFrom: null });
		queryClient.setQueryData(projectsListKey, []);
		queryClient.setQueryData(projectKey, { id: projectId });
		queryClient.setQueryData(ghKey, { ok: true });
		queryClient.setQueryData(healthKey, { ok: true });
	};

	test("non-ticket events invalidate the keys the plan lists for them", () => {
		const cases = [
			{
				event: { type: "comment.created" as const, id: ulid, ticketId: t1 },
				invalidated: [timelineKey(t1), detailKey],
				untouched: [timelineKey(t2), attachmentsKey(t1), prsKey(t1), healthKey],
			},
			{
				event: { type: "attachment.created" as const, id: ulid, ticketId: t1 },
				invalidated: [attachmentsKey(t1), detailKey],
				untouched: [attachmentsKey(t2), timelineKey(t1), prsKey(t1), healthKey],
			},
			{
				event: { type: "pr.updated" as const, id: ulid, ticketIds: [t1], state: "open", ciState: "pass" },
				invalidated: [prsKey(t1), detailKey, listKey],
				untouched: [prsKey(t2), attachmentsKey(t1), timelineKey(t1), healthKey],
			},
			{
				event: { type: "statuses.changed" as const, projectId },
				invalidated: [statusesKey, projectsListKey, projectKey, listKey],
				untouched: [ghKey, healthKey],
			},
			{
				event: { type: "gh.status" as const, ok: false, reason: "missing" },
				invalidated: [ghKey],
				untouched: [healthKey, listKey, detailKey],
			},
			{
				event: { type: "reset" as const, reason: "restart" },
				invalidated: [detailKey, listKey, prsKey(t1), statusesKey, projectsListKey, projectKey, ghKey, healthKey],
				untouched: [],
			},
		];
		for (const { event, invalidated, untouched } of cases) {
			const { queryClient, advanceTo, applier } = setup(seedResourceCaches);
			applier.applyEvent(event);
			advanceTo(1000);
			for (const key of invalidated) {
				expect(isInvalidated(queryClient, key), `${event.type} ${JSON.stringify(key)}`).toBe(true);
			}
			for (const key of untouched) {
				expect(isInvalidated(queryClient, key), `${event.type} ${JSON.stringify(key)}`).toBe(false);
			}
		}
	});
});
