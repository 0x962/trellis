import { expect, test } from "bun:test";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { backNavigation } from "./backNavigation";

const makeRouter = (initialEntries: string[]) => {
	const root = createRootRoute();
	return createRouter({
		routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: "$" })]),
		history: createMemoryHistory({ initialEntries }),
	});
};

test("Back restores the exact previous route without adding an entry", () => {
	const origin = "/p/QA/table?priority=high#row-2";
	const router = makeRouter([origin, "/t/QA-1", "/t/QA-2"]);
	backNavigation(router);
	expect(router.history.location.href).toBe("/t/QA-1");
	backNavigation(router);
	expect(router.history.location.href).toBe(origin);
	expect(router.history.length).toBe(3);
	router.history.forward();
	expect(router.history.location.href).toBe("/t/QA-1");
	router.history.forward();
	expect(router.history.location.href).toBe("/t/QA-2");
});

test("Back restores a non-list origin and its tab", () => {
	const origin = "/sessions/project/QA#session-2";
	const router = makeRouter([origin, "/t/QA-1?tab=agent"]);
	backNavigation(router);
	expect(router.history.location.href).toBe(origin);
});

test("Back traverses ticket and review tabs in order", () => {
	const entries = ["/t/QA-1", "/t/QA-1?tab=changes", "/reviews/owner/repo/1", "/reviews/owner/repo/1#checks"];
	const router = makeRouter([...entries]);
	for (const href of entries.slice(0, -1).reverse()) {
		backNavigation(router);
		expect(router.history.location.href).toBe(href);
	}
	expect(router.history.length).toBe(4);
});

test("Back from a direct entry replaces it with Needs you", async () => {
	const router = makeRouter(["/t/QA-1"]);
	await router.load();
	await backNavigation(router);
	expect(router.history.location.href).toBe("/needs-you");
	expect(router.history.length).toBe(1);
	expect(router.history.canGoBack()).toBe(false);
	backNavigation(router);
	expect(router.history.length).toBe(1);
});

test("a new destination after Back replaces the forward branch", async () => {
	const router = makeRouter(["/needs-you", "/t/QA-1", "/t/QA-2"]);
	backNavigation(router);
	await router.navigate({ href: "/settings#general" });
	expect(router.history.length).toBe(3);
	backNavigation(router);
	expect(router.history.location.href).toBe("/t/QA-1");
	router.history.forward();
	expect(router.history.location.href).toBe("/settings#general");
});

test("initial setup stays in place until an app page exists", async () => {
	const router = makeRouter(["/setup?step=project"]);
	await backNavigation(router);
	expect(router.history.location.href).toBe("/setup?step=project");
	expect(router.history.length).toBe(1);
});
