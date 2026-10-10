import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "test-renderer";
import { PageNotFound } from "./PageNotFound";

let previousScroll: PropertyDescriptor | undefined;
let renderer: ReturnType<typeof createRoot>;
let request: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
let random: ReturnType<typeof spyOn<typeof Math, "random">>;
let previousActEnvironment: boolean | undefined;
const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
	previousScroll = Object.getOwnPropertyDescriptor(globalThis, "scrollTo");
	Object.defineProperty(globalThis, "scrollTo", { configurable: true, value: () => {} });
	previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
	environment.IS_REACT_ACT_ENVIRONMENT = true;
	random = spyOn(Math, "random").mockReturnValue(0);
	request = spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(Response.json({ message: "https://example.com/dog-1.jpg" }))
		.mockResolvedValue(Response.json({ message: "https://example.com/dog-2.jpg" }));
	renderer = createRoot();
});

afterEach(async () => {
	await act(async () => renderer.unmount());
	if (previousScroll) Object.defineProperty(globalThis, "scrollTo", previousScroll);
	else Reflect.deleteProperty(globalThis, "scrollTo");
	request.mockRestore();
	random.mockRestore();
	environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test("navigation between missing URLs replaces the card and a route refresh keeps it", async () => {
	const root = createRootRoute({ notFoundComponent: PageNotFound });
	const router = createRouter({
		isServer: false,
		origin: "http://localhost",
		routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: "/search" })]),
		history: createMemoryHistory({ initialEntries: ["/missing-a"] }),
	});
	await router.load();
	await act(async () => renderer.render(<RouterProvider router={router} />));
	const picture = () => renderer.container.queryAll((node) => node.type === "img")[0]!;
	const first = picture();
	expect(first).toBeDefined();
	await act(async () => router.navigate({ href: "/missing-b" }));
	const next = picture();
	expect(next).toBeDefined();
	expect(next).not.toBe(first);
	expect(next.props.src).not.toBe(first.props.src);
	expect(request).toHaveBeenCalledTimes(2);
	await act(async () => router.invalidate());
	expect(picture()).toBe(next);
	await act(async () => router.navigate({ href: "/missing-b?q=same-page" }));
	expect(picture()).toBe(next);
	expect(request).toHaveBeenCalledTimes(2);
});
