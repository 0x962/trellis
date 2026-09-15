import { beforeEach, describe, expect, test } from "bun:test";
import { generateOperationKey } from "@orpc/tanstack-query";
import { setActorName } from "../../../../src/lib/actor";
import { createOrpc, orpc, queryClient } from "../../../../src/lib/orpc";
import { createTestServer } from "../../../server";

beforeEach(() => localStorage.clear());

describe("lib/orpc", () => {
	// WS-17. The batch link folds every call made in one tick into one
	// request. The fake server answers batches like the real one.
	test("two calls in one tick go out as one batched request with the actor header", async () => {
		setActorName("dana");
		const server = createTestServer();
		const requests: Request[] = [];
		const { client } = createOrpc({
			fetch: (request, init) => {
				requests.push(request.clone());
				return server.request(request, init);
			},
		});
		const [projects, settings] = await Promise.all([client.projects.list({}), client.settings.get()]);
		expect(projects.length).toBeGreaterThan(0);
		expect(settings.defaultActorName).toBe("dana");
		expect(requests).toHaveLength(1);
		expect(new URL(requests[0]!.url).pathname).toBe("/rpc/__batch__");
		expect(requests[0]!.headers.get("x-trellis-actor")).toBe("human:dana");
		expect(requests[0]!.headers.get("x-trellis-client")).toMatch(/^api\//);
	});

	test("a statuses read leaves at once and never waits in a batch", async () => {
		setActorName("dana");
		const server = createTestServer();
		const paths: string[] = [];
		const { client } = createOrpc({
			fetch: (request, init) => {
				paths.push(new URL(request.url).pathname);
				return server.request(request, init);
			},
		});
		await Promise.all([client.statuses.list({ project: "CDE" }), client.projects.list({}), client.settings.get()]);
		expect(paths.sort()).toEqual(["/rpc/__batch__", "/rpc/statuses/list"]);
	});

	// WS-18. applyEvent patches the cache under the keys the tanstack utils
	// build, so the app must query through those utils. SSE keeps every
	// entity current, so a query never goes stale by time and never retries.
	test("the query utils produce the keys applyEvent patches and the client never refetches by staleness", async () => {
		setActorName("dana");
		const key = orpc.tickets.get.queryOptions({ input: { ticket: "CDE-42" } }).queryKey;
		expect<unknown>(key).toEqual(
			generateOperationKey(["tickets", "get"], { input: { ticket: "CDE-42" }, type: "query" }),
		);
		const defaults = queryClient.getDefaultOptions().queries!;
		expect(defaults.staleTime).toBe(Number.POSITIVE_INFINITY);
		expect(defaults.retry).toBe(false);
		const server = createTestServer();
		const local = createOrpc({ fetch: (request, init) => server.request(request, init) });
		expect(local.queryClient.getDefaultOptions().queries!.staleTime).toBe(Number.POSITIVE_INFINITY);
		const projects = await local.queryClient.fetchQuery(local.orpc.projects.list.queryOptions({ input: {} }));
		expect(projects.map((project) => project.path)).toContain("CDE");
		expect<unknown>(
			local.queryClient.getQueryData(generateOperationKey(["projects", "list"], { input: {}, type: "query" })),
		).toBe(projects);
	});
});
