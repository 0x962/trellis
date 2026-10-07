import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { HarnessSchema, type Session } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import { SessionRow } from "./SessionRow";

const sessionId = "01M3ST0RYB00K0000000000402";
const longName = "Review every retained workspace change before the release starts";
const timestamp = "2026-10-07T00:00:00.000Z";
const session = {
	id: sessionId,
	name: longName,
	projectId: null,
	projectKey: "",
	directory: "/workspace/trellis/session",
	harness: HarnessSchema.parse({ preset: "claude" }),
	runId: "01M3ST0RYB00K0000000000401",
	pinnedAt: timestamp,
	archivedAt: null,
	createdAt: timestamp,
	updatedAt: timestamp,
} satisfies Session;

const render = async (active = false) => {
	const rootRoute = createRootRoute({
		component: () => (
			<AppProvider value={{} as AppContext}>
				<ul>
					<SessionRow session={session} status="unavailable" active={active} />
				</ul>
			</AppProvider>
		),
	});
	const routeTree = rootRoute.addChildren([
		createRoute({ getParentRoute: () => rootRoute, path: "/sessions/$id", component: () => null }),
	]);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [`/sessions/${active ? sessionId : "another-session"}`] }),
	});
	await router.load();
	return renderToStaticMarkup(<RouterProvider router={router} />);
};

test("the session link keeps its identity, status, route, and focus style", async () => {
	const html = await render();
	const link = html.match(/<a [\s\S]*?<\/a>/)?.[0] ?? "";

	expect(link).toContain(`href="/sessions/${sessionId}"`);
	expect(link).toContain("focus-visible:outline-2");
	expect(link).toContain('<span class="sr-only">Unavailable: </span>');
	expect(link).toContain(longName);
	expect(link).toContain('aria-label="Pinned"');
	expect(link).toContain(`title="${longName} \u00b7 Unavailable \u00b7 Pinned"`);
});

test("the decorative avatar does not add a hidden keyboard stop", async () => {
	const html = await render();
	const leading = html.match(/<span aria-hidden="true" class="sidebar-leading">([\s\S]*?)<\/span>/)?.[1] ?? "";

	expect(leading).toContain('role="img"');
	expect(leading).not.toContain("tabindex=");
});

test("the active session keeps its current-page state and expanded layout", async () => {
	const html = await render(true);

	expect(html).toContain('aria-current="page"');
	expect(html).toContain("sidebar-selected");
	expect(html).toContain("sidebar-label");
	expect(html).toContain('data-slot="trailing"');
});
