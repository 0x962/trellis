import { expect, test } from "bun:test";
import { generateOperationKey } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/query-core";
import { createEventApplier } from "./query-keys.ts";
import type { Scheduler } from "./scheduler.ts";

test("a Page comment event invalidates the project list", () => {
	let flush: (() => void) | undefined;
	const scheduler: Scheduler = {
		now: () => 0,
		setTimeout: (callback) => {
			flush = callback;
			return 1;
		},
		clearTimeout: () => {},
	};
	const queryClient = new QueryClient();
	const projectsKey = generateOperationKey(["projects", "list"], { input: { archived: false } });
	const statusesKey = generateOperationKey(["statuses", "list"], {});
	queryClient.setQueryData(projectsKey, []);
	queryClient.setQueryData(statusesKey, []);
	const applier = createEventApplier(queryClient, { scheduler });

	applier.applyEvent({
		type: "page-comments.changed",
		projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
		pageId: "01M3A9BCJ1TQ5V5T76BPTB9CKW",
		version: 1,
	});
	flush!();

	expect(queryClient.getQueryState(projectsKey)?.isInvalidated).toBe(true);
	expect(queryClient.getQueryState(statusesKey)?.isInvalidated).toBe(false);
});

for (const field of ["after", "status", "title", "project"]) {
	test(`a ${field} event refreshes exact dependencies on both tickets`, () => {
		let flush = () => {};
		const scheduler: Scheduler = {
			now: () => 0,
			setTimeout: (fn) => {
				flush = fn;
				return 1;
			},
			clearTimeout: () => {},
		};
		const client = new QueryClient();
		const keys = ["TST-1", "EXT-2"].map((ticket) =>
			generateOperationKey(["tickets", "dependencies"], { input: { ticket } }),
		);
		for (const key of keys) client.setQueryData(key, { waitsOn: [], blocks: [] });
		const applier = createEventApplier(client, { scheduler });
		applier.applyEvent({
			type: "ticket.updated",
			fields: [field],
			batchId: "01M3Q9B8S5S69P6T4BBDQDZSBJ",
			summary: {
				id: "01M3Q9B8S5S69P6T4BBDQDZSBJ",
				identifier: "TST-1",
				number: 1,
				title: "Ticket",
				priority: "none",
				status: { id: "01M24SPHTYMH65WQ2Q3TQFY4GP", slug: "todo", name: "Todo", category: "todo", color: "fg-muted" },
				project: { id: "01M24SPHTX36AJ3VKTNZ263E7V", key: "TST" },
				parent: null,
				ancestors: [],
				epic: null,
				wave: null,
				childCount: 0,
				childDoneCount: 0,
				attachmentCount: 0,
				labels: [],
				waitsOn: [],
				releases: [],
				ready: true,
				pr: null,
				prRows: [],
				lastActor: null,
				position: 1,
				version: 2,
				createdAt: "2026-09-29T19:00:00.000Z",
				updatedAt: "2026-09-29T19:00:00.000Z",
				completedAt: null,
			},
		});
		flush();
		for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
	});
}
