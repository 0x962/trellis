import { afterAll, expect, test } from "bun:test";
import { QueryObserver } from "@tanstack/react-query";
import type { FetchLike } from "@trellis/api";

// `createOrpc` reads `window.location.origin` while the module loads, and a
// test run has no browser. The imports below wait for it.
const hadWindow = "window" in globalThis;
const originalWindow = globalThis.window;
globalThis.window = { location: { origin: "http://127.0.0.1:4521" } } as Window & typeof globalThis;
afterAll(() => {
	if (hadWindow) globalThis.window = originalWindow;
	else Reflect.deleteProperty(globalThis, "window");
});

const { createOrpc } = await import("../../lib/orpc");
const { retrySidebarProjects, sidebarProjectsQuery } = await import("./sidebarProjects");

const noRequest: FetchLike = (request) => {
	throw new Error(`The test expected no request, and the app sent one to ${request.url}.`);
};

// A request function that fails `failures` times, as a host that still
// starts does, and then answers with an empty project list.
const flakyServer = (failures: number) => {
	const calls = { count: 0 };
	const queryFn = async () => {
		calls.count += 1;
		if (calls.count <= failures) throw new TypeError("fetch failed");
		return [];
	};
	return { calls, queryFn };
};

test("the sidebar project list retries failed requests until the server answers", async () => {
	const { orpc, queryClient } = createOrpc({ fetch: noRequest, baseUrl: "http://127.0.0.1:4521" });
	const server = flakyServer(3);

	const projects = await queryClient.fetchQuery({
		...sidebarProjectsQuery(orpc),
		queryFn: server.queryFn,
		retryDelay: 1,
	});

	expect(projects).toEqual([]);
	expect(server.calls.count).toBe(4);
});

test("the project list gets the shared retry default", async () => {
	const { orpc, queryClient } = createOrpc({ fetch: noRequest, baseUrl: "http://127.0.0.1:4521" });
	const server = flakyServer(2);
	const options = orpc.projects.list.queryOptions({ input: { archived: false } });

	const projects = await queryClient.fetchQuery({ ...options, queryFn: server.queryFn, retryDelay: 1 });

	expect(projects).toEqual([]);
	expect(server.calls.count).toBe(3);
});

test("a non-list query fails on the first failed request", async () => {
	const { orpc, queryClient } = createOrpc({ fetch: noRequest, baseUrl: "http://127.0.0.1:4521" });
	const server = flakyServer(1);
	const options = orpc.projects.get.queryOptions({ input: { project: "TRL" } });

	await expect(queryClient.fetchQuery({ ...options, queryFn: server.queryFn })).rejects.toThrow("fetch failed");
	expect(server.calls.count).toBe(1);
});

test("a retry sends a request at once, while the query waits for its next try", async () => {
	const { orpc, queryClient } = createOrpc({ fetch: noRequest, baseUrl: "http://127.0.0.1:4521" });
	const server = flakyServer(1);
	const observer = new QueryObserver(queryClient, {
		...sidebarProjectsQuery(orpc),
		queryFn: server.queryFn,
		retryDelay: 60_000,
	});
	const unsubscribe = observer.subscribe(() => {});
	while (observer.getCurrentResult().failureCount === 0) await Bun.sleep(1);

	await retrySidebarProjects(queryClient, orpc);

	expect(observer.getCurrentResult().data).toEqual([]);
	expect(server.calls.count).toBe(2);
	unsubscribe();
});
