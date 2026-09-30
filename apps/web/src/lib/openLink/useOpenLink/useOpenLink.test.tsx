import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "test-renderer";
import { pageSheetActions, usePageSheetStore } from "../../../stores/pageSheetStore";
import { type AppContext, AppProvider } from "../../appContext";
import { useOpenLink } from "./useOpenLink";

let previousLocation: PropertyDescriptor | undefined;
let renderer: ReturnType<typeof createRoot>;

beforeEach(() => {
	previousLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
	Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "http://localhost" } });
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	renderer = createRoot();
});

afterEach(async () => {
	await act(async () => renderer.unmount());
	pageSheetActions.closeTicket();
	if (previousLocation) Object.defineProperty(globalThis, "location", previousLocation);
	else Reflect.deleteProperty(globalThis, "location");
});

async function mount(href: string, resolvedHref = "/t/TRL-1255") {
	const root = createRootRoute();
	const router = createRouter({
		routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: "$" })]),
		history: createMemoryHistory({ initialEntries: [href] }),
	});
	const resolved: string[] = [];
	const app = {
		client: {
			internalLinks: {
				resolve: async ({ link }: { link: string }) => {
					resolved.push(link);
					return { href: resolvedHref };
				},
			},
		},
	} as unknown as AppContext;
	let open: ReturnType<typeof useOpenLink>;
	function Probe() {
		open = useOpenLink();
		return null;
	}
	await act(async () => {
		renderer.render(
			<RouterContextProvider router={router}>
				<AppProvider value={app}>
					<Probe />
				</AppProvider>
			</RouterContextProvider>,
		);
	});
	return { router, resolved, open: (url: string) => act(async () => open(url)) };
}

test("an absolute ticket link opens over the current page without a history entry", async () => {
	const origin = "/p/TRL/epics/review?group=wave#row-5";
	const fixture = await mount(origin);
	await fixture.open("http://localhost/t/TRL%2D1255");
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1255");
	expect(fixture.router.history.location.href).toBe(origin);
	expect(fixture.router.history.length).toBe(1);
	expect(fixture.resolved).toEqual([]);
});

test("a resolved ticket record link opens over the session that holds the link", async () => {
	const origin = "/sessions/01M3REG55BW887SNRFDWFDCZFV";
	const fixture = await mount(origin);
	const link = "trellis://ticket/01M3RBQQ6HGKVWC09YHXS77E84";
	await fixture.open(link);
	expect(fixture.resolved).toEqual([link]);
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1255");
	expect(fixture.router.history.location.href).toBe(origin);
});

test("a non-ticket route still navigates", async () => {
	const fixture = await mount("/search");
	await fixture.open("http://localhost/p/TRL/table?group=wave");
	expect(usePageSheetStore.getState().ticket).toBeNull();
	expect(fixture.router.history.location.href).toBe("/p/TRL/table?group=wave");
});

test("a Page link opens above the session and close returns to that session", async () => {
	const origin = "/p/TRL/epics/review?group=wave#row-5";
	const fixture = await mount(origin);
	pageSheetActions.openTicket("TRL-1304");
	pageSheetActions.openSession("session-1304");
	await fixture.open("http://localhost/p/trl/pages/report?version=2");

	expect(usePageSheetStore.getState()).toMatchObject({
		ticket: "TRL-1304",
		session: "session-1304",
		publishedPage: { ref: "TRL/pages/report", version: 2 },
	});
	expect(fixture.router.history.location.href).toBe(origin);
	expect(fixture.router.history.length).toBe(1);
	expect(fixture.resolved).toEqual([]);

	pageSheetActions.closePublishedPage();
	expect(usePageSheetStore.getState()).toMatchObject({
		ticket: "TRL-1304",
		session: "session-1304",
		publishedPage: null,
	});
	expect(fixture.router.history.location.href).toBe(origin);
});

test("a Page record link resolves before it opens above the session", async () => {
	const fixture = await mount("/search", "/p/TRL/pages/report");
	pageSheetActions.openSession("session-1304");
	const link = "trellis://page/01M3RBQQ6HGKVWC09YHXS77E84";
	await fixture.open(link);

	expect(fixture.resolved).toEqual([link]);
	expect(usePageSheetStore.getState()).toMatchObject({
		session: "session-1304",
		publishedPage: { ref: "TRL/pages/report" },
	});
	expect(fixture.router.history.location.href).toBe("/search");
});

test("Pages outside a session keep their route behavior", async () => {
	const fixture = await mount("/search");
	await fixture.open("http://localhost/p/TRL/pages/report?version=3");
	expect(usePageSheetStore.getState().publishedPage).toBeNull();
	expect(fixture.router.history.location.href).toBe("/p/TRL/pages/report?version=3");
});

test("the Page list still navigates while a session is open", async () => {
	const fixture = await mount("/search");
	pageSheetActions.openSession("session-1304");
	await fixture.open("http://localhost/p/TRL/pages");
	expect(usePageSheetStore.getState().publishedPage).toBeNull();
	expect(fixture.router.history.location.href).toBe("/p/TRL/pages");
});
