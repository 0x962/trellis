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
