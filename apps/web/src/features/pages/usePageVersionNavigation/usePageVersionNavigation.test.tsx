import { afterEach, expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import { act, type MouseEvent } from "react";
import { createRoot } from "test-renderer";
import { pageSheetActions, usePageSheetStore } from "../../../stores/pageSheetStore";
import { PageSheetContext } from "../../shell/PageSheet/pageSheetContext";
import { usePageVersionNavigation } from "./usePageVersionNavigation";

let renderer: ReturnType<typeof createRoot>;

afterEach(async () => {
	await act(async () => renderer.unmount());
	pageSheetActions.closeTicket();
});

async function mount(inSheet: boolean) {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	renderer = createRoot();
	const root = createRootRoute();
	const router = createRouter({
		routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: "/p/$" })]),
		history: createMemoryHistory({ initialEntries: ["/p/TRL/table"] }),
	});
	let navigation: ReturnType<typeof usePageVersionNavigation>;
	function Probe() {
		navigation = usePageVersionNavigation("TRL/pages/report");
		return null;
	}
	const context = { topbar: null, close: () => {}, depth: 1, rootWidth: "", stack: [] };
	await act(async () => {
		renderer.render(
			<RouterContextProvider router={router}>
				<PageSheetContext.Provider value={inSheet ? context : null}>
					<Probe />
				</PageSheetContext.Provider>
			</RouterContextProvider>,
		);
	});
	return { router, navigation: navigation! };
}

test("historical and current versions stay above the same session", async () => {
	const { router, navigation } = await mount(true);
	pageSheetActions.openSession("session-1304");
	await act(async () => navigation.openVersion(1));
	expect(usePageSheetStore.getState().publishedPage).toEqual({ ref: "TRL/pages/report", version: 1 });
	await act(async () => navigation.openVersion());
	expect(usePageSheetStore.getState().publishedPage).toEqual({ ref: "TRL/pages/report", version: undefined });
	expect(usePageSheetStore.getState().session).toBe("session-1304");
	expect(router.history.location.href).toBe("/p/TRL/table");
	expect(router.history.length).toBe(1);
});

test("the routed viewer opens the requested version on its route", async () => {
	const { router, navigation } = await mount(false);
	await act(async () => navigation.openVersion(1));
	expect(router.history.location.href).toBe("/p/TRL/pages/report?version=1");
	expect(usePageSheetStore.getState().publishedPage).toBeNull();
});

test("a modified version link retains its default action", async () => {
	const { navigation } = await mount(true);
	let prevented = false;
	const event = {
		button: 0,
		metaKey: true,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		preventDefault: () => {
			prevented = true;
		},
	} as MouseEvent;
	await act(async () => navigation.onVersionClick(event, 1));
	expect(prevented).toBe(false);
	expect(usePageSheetStore.getState().publishedPage).toBeNull();
	await act(async () => navigation.onVersionClick({ ...event, metaKey: false }, 1));
	expect(prevented).toBe(true);
	expect(usePageSheetStore.getState().publishedPage?.version).toBe(1);
});
