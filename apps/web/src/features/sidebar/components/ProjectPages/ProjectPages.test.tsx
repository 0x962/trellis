import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectPages } from "./ProjectPages";

const project = {
	id: "01M24SPHTX36AJ3VKTNZ263E7V",
	key: "TRL",
	slug: "trellis",
	name: "Trellis",
	position: 0,
	openCount: 12,
	openEpicCount: 3,
	color: null,
	archivedAt: null,
} satisfies ProjectSummary;

// A `Link` reads the router, so the rows need one. This router holds the two
// routes the rows open and starts on the page under test.
const render = async (pathname: string, { activeAgentCount = 0, moreOpen = false } = {}) => {
	const rootRoute = createRootRoute({
		component: () => (
			<ul>
				<ProjectPages
					project={project}
					pathname={pathname}
					activeAgentCount={activeAgentCount}
					moreOpen={moreOpen}
					onToggleMore={() => {}}
				/>
			</ul>
		),
	});
	const routeTree = rootRoute.addChildren([
		createRoute({ getParentRoute: () => rootRoute, path: "/p/$", component: () => null }),
		createRoute({
			getParentRoute: () => rootRoute,
			path: "/sessions/project/$project",
			component: () => null,
		}),
	]);
	const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [pathname] }) });
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
};

const labels = (html: string) => [...html.matchAll(/class="sidebar-label">([^<]*)</g)].map((match) => match[1]);

test("the project shows Epics, then Sessions, then More", async () => {
	expect(labels(await render("/p/TRL/epics"))).toEqual(["Epics", "Sessions", "More"]);
});

test("More is shut on a page it does not hold", async () => {
	const html = await render("/p/TRL/epics");

	expect(html).toContain('aria-expanded="false"');
	expect(labels(html)).not.toContain("Tickets");
	expect(labels(html)).not.toContain("Diffs");
});

test("a project whose current page is Sessions renders with More shut", async () => {
	const html = await render("/sessions/project/TRL");

	expect(html).toContain('aria-expanded="false"');
	expect(labels(html)).toEqual(["Epics", "Sessions", "More"]);
	const sessions = html.match(/<a [^>]*>(?=<span class="sidebar-label">Sessions<)/)?.[0] ?? "";

	expect(sessions).toContain('href="/sessions/project/TRL"');
	expect(sessions).toContain('aria-current="page"');
	expect(sessions).toContain("sidebar-selected");
});

test("a project whose current page is Diffs renders with More shut", async () => {
	const html = await render("/p/TRL/diffs");

	expect(html).toContain('aria-expanded="false"');
	expect(labels(html)).toEqual(["Epics", "Sessions", "More"]);
});

test("a project whose current page is Tickets renders with More shut", async () => {
	const html = await render("/p/TRL");

	expect(html).toContain('aria-expanded="false"');
	expect(labels(html)).toEqual(["Epics", "Sessions", "More"]);
});

test("an open More row shows the pages it holds", async () => {
	const html = await render("/p/TRL/epics", { moreOpen: true });

	expect(html).toContain('aria-expanded="true"');
	expect(labels(html)).toEqual(["Epics", "Sessions", "More", "Tickets", "Diffs"]);
	const diffs = html.match(/<a [^>]*>(?=<span class="sidebar-label">Diffs<)/)?.[0] ?? "";

	expect(diffs).toContain('href="/p/TRL/diffs"');
});

test("the rows under More indent one step past the rows above them", async () => {
	const html = await render("/p/TRL", { moreOpen: true });
	const indentOf = (label: string) =>
		html.match(new RegExp(`class="([^"]*)"[^>]*><span class="sidebar-label">${label}<`))?.[1]?.match(/pl-\d+/)?.[0] ??
		null;

	expect(indentOf("Epics")).toBe("pl-8");
	expect(indentOf("Sessions")).toBe("pl-8");
	expect(indentOf("More")).toBe("pl-8");
	expect(indentOf("Tickets")).toBe("pl-11");
	expect(indentOf("Diffs")).toBe("pl-11");
});

test("only the Epics row prints a count", async () => {
	const html = await render("/p/TRL", { moreOpen: true });

	const counts = [...html.matchAll(/<span class="[^"]*sidebar-trailing[^"]*">([^<]*)<\/span>/g)];

	expect(counts.map((match) => match[1])).toEqual(["3"]);
});

test("the Sessions row shows a dot while agents of the project are active", async () => {
	const html = await render("/sessions/project/TRL", { activeAgentCount: 2 });

	expect(html).toContain('aria-label="2 agents are active"');
});

test("the Sessions row shows its dot on a page that keeps More shut", async () => {
	const html = await render("/p/TRL/epics", { activeAgentCount: 1 });

	expect(html).toContain('aria-expanded="false"');
	const sessions = html.match(/<a [^>]*>(?=<span class="sidebar-label">Sessions<)/s)?.index ?? -1;
	const dot = html.indexOf('aria-label="1 agent is active"');

	expect(dot).toBeGreaterThan(sessions);
	// No row under More carries a count, so the More row draws no dot of its own.
	expect(html).not.toContain("data-dot-and-caret");
});

test("no row shows a dot while no agent of the project is active", async () => {
	const html = await render("/sessions/project/TRL");

	expect(html).not.toContain("is active");
	expect(html).not.toContain("data-dot-and-caret");
});
