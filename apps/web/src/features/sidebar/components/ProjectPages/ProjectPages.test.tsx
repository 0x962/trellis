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
	archivedAt: null,
} satisfies ProjectSummary;

// A `Link` reads the router, so the rows need one. This router holds the two
// routes the rows open and starts on the page under test.
const render = async (pathname: string, activeAgentCount = 0) => {
	const rootRoute = createRootRoute({
		component: () => (
			<ul>
				<ProjectPages project={project} pathname={pathname} activeAgentCount={activeAgentCount} />
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

test("the project shows Epics, then Diffs, then More", async () => {
	expect(labels(await render("/p/TRL/epics"))).toEqual(["Epics", "Diffs", "More"]);
});

test("More is shut on a page it does not hold", async () => {
	const html = await render("/p/TRL/epics");

	expect(html).toContain('aria-expanded="false"');
	expect(labels(html)).not.toContain("Tickets");
	expect(labels(html)).not.toContain("Sessions");
});

test("a project whose current page is Sessions renders with More open", async () => {
	const html = await render("/sessions/project/TRL");

	expect(html).toContain('aria-expanded="true"');
	expect(labels(html)).toEqual(["Epics", "Diffs", "More", "Tickets", "Sessions"]);
	const sessions = html.match(/<a [^>]*>(?=<span class="sidebar-label">Sessions<)/)?.[0] ?? "";

	expect(sessions).toContain('href="/sessions/project/TRL"');
	expect(sessions).toContain('aria-current="page"');
	expect(sessions).toContain("sidebar-selected");
});

test("a project whose current page is Tickets renders with More open", async () => {
	const html = await render("/p/TRL");

	expect(labels(html)).toEqual(["Epics", "Diffs", "More", "Tickets", "Sessions"]);
});

test("the rows under More indent one step past the rows above them", async () => {
	const html = await render("/p/TRL");
	const indentOf = (label: string) =>
		html.match(new RegExp(`class="([^"]*)"[^>]*><span class="sidebar-label">${label}<`))?.[1]?.match(/pl-\d+/)?.[0] ??
		null;

	expect(indentOf("Epics")).toBe("pl-8");
	expect(indentOf("Diffs")).toBe("pl-8");
	expect(indentOf("More")).toBe("pl-8");
	expect(indentOf("Tickets")).toBe("pl-11");
	expect(indentOf("Sessions")).toBe("pl-11");
});

test("only the Epics row prints a count", async () => {
	const html = await render("/p/TRL");

	const counts = [...html.matchAll(/<span class="sidebar-trailing gap-1 text-fg-faint">([^<]*)<\/span>/g)];

	expect(counts.map((match) => match[1])).toEqual(["3"]);
});

test("the Sessions row shows a dot while agents of the project are active", async () => {
	const html = await render("/sessions/project/TRL", 2);

	expect(html).toContain('aria-label="2 agents are active"');
});

test("the More row shows the dot while it hides the Sessions row", async () => {
	const html = await render("/p/TRL/epics", 1);

	expect(html).toContain('aria-expanded="false"');
	expect(html).toContain('aria-label="1 agent is active"');
});

test("no row shows a dot while no agent of the project is active", async () => {
	expect(await render("/sessions/project/TRL")).not.toContain("is active");
});
