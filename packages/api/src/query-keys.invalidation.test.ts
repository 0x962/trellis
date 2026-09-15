import { describe, expect, spyOn, test } from "bun:test";
import type { QueryClient } from "@tanstack/query-core";
import {
	boardKey,
	boardPage,
	countsKey,
	createdEvent,
	deletedEvent,
	detailKey,
	healthKey,
	isInvalidated,
	listKey,
	listPage,
	seedTicketCaches,
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
		queryClient.setQueryData(detailKey, ticket(v3));
		queryClient.setQueryData(healthKey, { ok: true });
	};

	const membershipKeys = [filteredListKey, boardKey, countsKey];

	// A patch keeps a row current. A filtered list cannot know whether the row
	// still belongs to it after a status, project, priority, parent, or
	// completion change. Only those fields, and create or delete, refetch the
	// lists. A description change refetches only the detail.
	test("only membership-changing fields and create or delete events enqueue an invalidation", () => {
		const cases = [
			{ name: "status", event: updatedEvent(summaryAt(4), ["status"]), invalidates: true, detail: false },
			{ name: "project", event: updatedEvent(summaryAt(4), ["project"]), invalidates: true, detail: false },
			{ name: "priority", event: updatedEvent(summaryAt(4), ["priority"]), invalidates: true, detail: false },
			{ name: "parent", event: updatedEvent(summaryAt(4), ["parent"]), invalidates: true, detail: false },
			{ name: "completedAt", event: updatedEvent(summaryAt(4), ["completedAt"]), invalidates: true, detail: false },
			{ name: "title", event: updatedEvent(summaryAt(4), ["title"]), invalidates: false, detail: false },
			{ name: "description", event: updatedEvent(summaryAt(4), ["description"]), invalidates: false, detail: true },
			{
				name: "created",
				event: {
					type: "ticket.created" as const,
					summary: summaryAt(1, { id: t2, identifier: "CDE-43", number: 43 }),
					fields: [],
					batchId: ulid,
				},
				invalidates: true,
				detail: false,
			},
		];
		for (const { name, event, invalidates, detail } of cases) {
			const { queryClient, advanceTo, applier, invalidateQueries } = setup(seedMembershipCaches);
			applier.applyEvent(event);
			expect(invalidateQueries, `${name} fired at t=0`).not.toHaveBeenCalled();
			advanceTo(1000);
			for (const key of membershipKeys) {
				expect(isInvalidated(queryClient, key), `${name} ${JSON.stringify(key[0])}`).toBe(invalidates);
			}
			expect(isInvalidated(queryClient, detailKey), `${name} detail`).toBe(detail);
			expect(isInvalidated(queryClient, healthKey), `${name} health`).toBe(false);
		}
	});

	// The sidebar reads `openCount` from the projects list. A create, a
	// delete, or a membership change moves that count, and no project event
	// follows. A title change moves no count.
	test("a create, a delete, or a membership change invalidates the projects list, and a title change does not", () => {
		const projectsListKey = queryKey(["projects", "list"]);
		const cases = [
			{
				name: "created",
				event: createdEvent(summaryAt(1, { id: t2, identifier: "CDE-43", number: 43 })),
				invalidates: true,
			},
			{ name: "deleted", event: deletedEvent(summaryAt(3)), invalidates: true },
			{ name: "status", event: updatedEvent(summaryAt(4), ["status"]), invalidates: true },
			{ name: "completedAt", event: updatedEvent(summaryAt(4), ["completedAt"]), invalidates: true },
			{ name: "title", event: updatedEvent(summaryAt(4), ["title"]), invalidates: false },
		];
		for (const { name, event, invalidates } of cases) {
			const { queryClient, advanceTo, applier } = setup((queryClient) => {
				seedMembershipCaches(queryClient);
				queryClient.setQueryData(projectsListKey, []);
			});
			applier.applyEvent(event);
			advanceTo(1000);
			expect(isInvalidated(queryClient, projectsListKey), name).toBe(invalidates);
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

	// While an invalidation waits, every event asks which cached queries the
	// queue covers. That answer comes from a fixed number of cache scans per
	// event. A scan per cached query would cost O(queries^2) under a stream.
	test("the number of cache scans one event costs does not grow with the number of cached queries", () => {
		const scans = (count: number) => {
			const { queryClient, applier } = setup((queryClient) => {
				seedTicketCaches(summaryAt(3))(queryClient);
				for (let index = 0; index < count; index += 1) {
					const identifier = `CDE-${100 + index}`;
					const other = summaryAt(3, { id: `${ulid.slice(0, 22)}${1000 + index}`, identifier, number: 100 + index });
					queryClient.setQueryData(queryKey(["tickets", "get"], { ticket: identifier }), ticket(other));
				}
			});
			applier.applyEvent(updatedEvent(summaryAt(4), ["status"]));
			const getAll = spyOn(queryClient.getQueryCache(), "getAll");
			applier.applyEvent(updatedEvent(summaryAt(5, { title: "Fifth" }), ["title"]));
			return getAll.mock.calls.length;
		};
		expect(scans(40)).toBe(scans(10));
	});

	const prsKey = (id: string) => queryKey(["pullRequests", "list"], { ticket: id });
	const attachmentsKey = (id: string) => queryKey(["attachments", "list"], { ticket: id });
	const timelineKey = (id: string) => queryKey(["timeline", "list"], { ticket: id });
	const statusesKey = queryKey(["statuses", "list"], { project: "CDE" });
	const projectsListKey = queryKey(["projects", "list"]);
	const projectKey = queryKey(["projects", "get"], { project: "CDE" });
	const ghKey = queryKey(["system", "gh"]);
	const searchKey = queryKey(["search", "query"], { q: "first" });

	// Every ref grammar is case-insensitive on input, so a query may be keyed
	// by a lower-case ref that the server accepts.
	const lowerT1 = t1.toLowerCase();

	// The ticket page opens the detail by the identifier from the URL and its
	// sub-resources by the same identifier. An event carries only the ULID, so
	// the applier reads the identifier from the cached detail.
	const seedResourceCaches = (queryClient: QueryClient) => {
		queryClient.setQueryData(detailKey, ticket(summaryAt(3)));
		queryClient.setQueryData(listKey, listPage(summaryAt(3)));
		queryClient.setQueryData(searchKey, { tickets: [summaryAt(3)], projects: [] });
		for (const id of [t1, t2, "CDE-42", "CDE-43", "cde-42", lowerT1]) {
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

	// The server writes an activity row for every ticket change, and the
	// timeline lists activity beside the comments. So a ticket event refetches
	// the ticket's timeline, keyed by ULID or by identifier.
	test("a ticket event invalidates the ticket's timeline and no other ticket's", () => {
		const { queryClient, advanceTo, applier } = setup(seedResourceCaches);
		applier.applyEvent(updatedEvent(summaryAt(4), ["priority"]));
		advanceTo(1000);
		for (const id of [t1, "CDE-42", "cde-42", lowerT1]) {
			expect(isInvalidated(queryClient, timelineKey(id)), id).toBe(true);
		}
		for (const id of [t2, "CDE-43"]) {
			expect(isInvalidated(queryClient, timelineKey(id)), id).toBe(false);
		}
		expect(isInvalidated(queryClient, attachmentsKey(t1))).toBe(false);
		expect(isInvalidated(queryClient, prsKey(t1))).toBe(false);
	});

	test("non-ticket events invalidate the keys the plan lists for them", () => {
		const cases = [
			{
				event: { type: "comment.created" as const, id: ulid, ticketId: t1 },
				invalidated: [timelineKey(t1), timelineKey("CDE-42"), timelineKey("cde-42"), timelineKey(lowerT1), detailKey],
				untouched: [timelineKey(t2), timelineKey("CDE-43"), attachmentsKey(t1), prsKey(t1), healthKey],
			},
			{
				event: { type: "attachment.created" as const, id: ulid, ticketId: t1 },
				invalidated: [attachmentsKey(t1), attachmentsKey("CDE-42"), attachmentsKey("cde-42"), detailKey],
				untouched: [attachmentsKey(t2), attachmentsKey("CDE-43"), timelineKey(t1), prsKey(t1), healthKey],
			},
			{
				event: { type: "pr.updated" as const, id: ulid, ticketIds: [t1], state: "open", ciState: "pass" },
				invalidated: [prsKey(t1), prsKey("CDE-42"), prsKey(lowerT1), detailKey, listKey],
				untouched: [prsKey(t2), prsKey("CDE-43"), attachmentsKey(t1), timelineKey(t1), healthKey],
			},
			// A status rename or a reviewer change alters the `status` inside
			// every cached summary without a ticket row change. So every query that holds a summary refetches.
			{
				event: { type: "statuses.changed" as const, projectId },
				invalidated: [statusesKey, projectsListKey, projectKey, listKey, detailKey, searchKey],
				untouched: [ghKey, healthKey, timelineKey(t1)],
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

test("reply and resolution events invalidate cached threads for their ticket", () => {
	const rootKey = queryKey(["comments", "thread"], { id: ulid });
	const replyKey = queryKey(["comments", "thread"], { id: t1 });
	const otherKey = queryKey(["comments", "thread"], { id: t2 });
	for (const type of ["comment.created", "comment.updated", "comment.deleted"] as const) {
		const { queryClient, advanceTo, applier } = setup((client) => {
			client.setQueryData(rootKey, { root: { id: ulid, ticketId: t1 }, replies: [] });
			client.setQueryData(replyKey, { root: { id: ulid, ticketId: t1 }, replies: [] });
			client.setQueryData(otherKey, { root: { id: t2, ticketId: t2 }, replies: [] });
		});
		applier.applyEvent({ type, id: t1, ticketId: t1, parentId: ulid, threadId: ulid });
		advanceTo(1000);
		expect(isInvalidated(queryClient, rootKey), type).toBe(true);
		expect(isInvalidated(queryClient, replyKey), type).toBe(true);
		expect(isInvalidated(queryClient, otherKey), type).toBe(false);
	}
});
