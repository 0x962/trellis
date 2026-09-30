import { afterEach, expect, test } from "bun:test";
import { createMemoryHistory, createRootRouteWithContext, createRoute, createRouter } from "@tanstack/react-router";
import { act, type MouseEvent } from "react";
import { createRoot } from "test-renderer";
import type { RouterContext } from "../../../lib/appContext";
import { Route as TicketRoute } from "../../../routes/t/$identifier/route";
import { pageSheetActions, usePageSheetStore } from "../../../stores/pageSheetStore";
import { TicketLink } from "./TicketLink";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => pageSheetActions.closeTicket());

function makeRouter(initialEntries: string[]) {
	const root = createRootRouteWithContext<RouterContext>()();
	const ticket = createRoute({
		getParentRoute: () => root,
		path: "/t/$identifier",
		beforeLoad: (context) =>
			TicketRoute.options.beforeLoad!(
				context as unknown as Parameters<NonNullable<typeof TicketRoute.options.beforeLoad>>[0],
			),
	});
	const home = createRoute({ getParentRoute: () => root, path: "/" });
	const origin = createRoute({ getParentRoute: () => root, path: "/search" });
	return createRouter({
		routeTree: root.addChildren([ticket, home, origin]),
		history: createMemoryHistory({ initialEntries }),
		context: {} as RouterContext,
		origin: "http://localhost",
		isServer: false,
	});
}

test("a shared ticket URL opens the sheet and replaces its history entry", async () => {
	const router = makeRouter(["/t/TRL-1255"]);
	await router.load();
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1255");
	expect(router.history.location.href).toBe("/");
	expect(router.history.length).toBe(1);
	pageSheetActions.closeTicket();
	expect(router.history.location.href).toBe("/");
});

test("preloading a ticket preserves the sheet and navigation still opens the requested ticket", async () => {
	const router = makeRouter(["/search?q=bug"]);
	pageSheetActions.openTicket("TRL-1");
	await router.load();
	await router.preloadRoute({ to: "/t/$identifier", params: { identifier: "TRL-1255" } });
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1");
	expect(router.history.location.href).toBe("/search?q=bug");
	await router.navigate({ href: "/t/TRL-1255" });
	expect(usePageSheetStore.getState().ticket).toBe("TRL-1255");
	expect(router.history.location.href).toBe("/");
	pageSheetActions.closeTicket();
	router.history.back();
	expect(router.history.location.href).toBe("/search?q=bug");
});

test("a ticket ID URL also opens a sheet", async () => {
	const id = "01M3RBQQ6HGKVWC09YHXS77E84";
	const router = makeRouter([`/t/${id}`]);
	await router.load();
	expect(usePageSheetStore.getState().ticket).toBe(id);
	expect(router.history.location.href).toBe("/");
});

test("a ticket link forwards button attributes and keeps modified clicks as links", async () => {
	const renderer = createRoot();
	await act(async () => {
		renderer.render(<TicketLink identifier="TRL-1255" aria-label="Open TRL-1255" className="action" />);
	});
	try {
		const anchor = renderer.container.queryAll((node) => node.type === "a")[0]!;
		expect(anchor.props.href).toBe("/t/TRL-1255");
		expect(anchor.props["aria-label"]).toBe("Open TRL-1255");
		expect(anchor.props.className).toBe("action");
		for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
			const event = click(modifiers);
			anchor.props.onClick(event);
			expect(event.defaultPrevented).toBe(false);
			expect(usePageSheetStore.getState().ticket).toBeNull();
		}
		const event = click();
		anchor.props.onClick(event);
		expect(event.defaultPrevented).toBe(true);
		expect(usePageSheetStore.getState().ticket).toBe("TRL-1255");
	} finally {
		await act(async () => renderer.unmount());
	}
});

function click(modifiers: MouseEventInit = {}) {
	return Object.assign(new Event("click", { cancelable: true }), {
		button: 0,
		metaKey: false,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		...modifiers,
	}) as unknown as MouseEvent<HTMLAnchorElement>;
}
