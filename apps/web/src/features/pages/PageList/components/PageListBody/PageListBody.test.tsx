import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { PageSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { PageListBody, type PageListBodyProps } from "./PageListBody";

const page = {
	id: "01M3APE7QBXVHCKG339JWA3MVK",
	projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
	projectKey: "TRL",
	ref: "TRL/pages/release-report",
	slug: "release-report",
	title: "Release report",
	summary: "What ships next.",
	revision: 1,
	latestVersion: 2,
	creator: { name: "Agent", kind: "agent" },
	actor: { name: "Agent", kind: "agent" },
	publishedBy: { name: "Agent", kind: "agent" },
	publishedAt: "2026-09-24T20:00:00.000Z",
	watcher: null,
	pinned: true,
	openThreadCount: 1,
	deletedAt: null,
	deletedBy: null,
	purgeAt: null,
	createdAt: "2026-09-24T20:00:00.000Z",
	updatedAt: "2026-09-24T20:00:00.000Z",
} satisfies PageSummary;

const defaults: PageListBodyProps = {
	projectKey: "TRL",
	pages: [],
	pending: false,
	error: null,
	offline: false,
	filtered: false,
	archived: false,
	hasMore: false,
	loadingMore: false,
	pinningId: null,
	onRetry: () => {},
	onCreate: () => {},
	onLoadMore: () => {},
	onPin: () => {},
};

const render = async (props: Partial<PageListBodyProps> = {}) => {
	const root = createRootRoute({ component: () => <PageListBody {...defaults} {...props} /> });
	const route = createRoute({ getParentRoute: () => root, path: "/p/$", component: () => null });
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/p/TRL/pages"] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
};

test("draws stable skeleton rows while the list loads", async () => {
	const html = await render({ pending: true });

	expect(html).toContain('aria-label="Load Pages"');
	expect(html.match(/h-14/g)?.length).toBe(4);
});

test("distinguishes an empty project from an empty filter", async () => {
	expect(await render()).toContain("No Pages yet");
	expect(await render()).toContain("Create Page");
	expect(await render({ filtered: true })).toContain("No Pages match");
	expect(await render({ filtered: true })).not.toContain("Create Page");
});

test("uses the failure state for load and offline errors", async () => {
	expect(await render({ error: new Error("boom") })).toContain("The Pages did not load");
	expect(await render({ error: new TypeError("Failed to fetch"), offline: true })).toContain("The server is offline");
});

test("keeps loaded rows when a refresh fails", async () => {
	const html = await render({ pages: [page], error: new Error("boom") });

	expect(html).toContain("The Pages did not refresh");
	expect(html).toContain("Release report");
});

test("shows the next keyset action after the current rows", async () => {
	const html = await render({ pages: [page], hasMore: true });

	expect(html).toContain('href="/p/TRL/pages/release-report"');
	expect(html).toContain('aria-label="Load more Pages"');
});
