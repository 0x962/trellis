import { expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import { ulid } from "ulid";
import type { ServiceTransport } from "../db/transport.ts";
import type { GhAccess } from "../ghState.ts";
import { createDbTiming } from "../serverTiming.ts";
import type { ServiceName } from "../services/registry.ts";
import { type ProcedureContext, router } from "./index.ts";

type Call = (name: ServiceName, ctx: Parameters<ServiceTransport["call"]>[1], input: unknown) => Promise<unknown>;

const handler = new OpenAPIHandler<ProcedureContext>(router, {
	plugins: [new ResponseHeadersPlugin<ProcedureContext>()],
});

const request = async (path: string, init: RequestInit, call: Call) => {
	const raw = new Request(`http://trellis.test/api${path}`, init);
	const transport = { call } as ServiceTransport;
	const context: ProcedureContext = {
		headers: raw.headers,
		reqId: ulid(),
		transport,
		actor: null,
		timing: createDbTiming(),
		chooseDirectory: async () => null,
		gh: {} as GhAccess,
	};
	const result = await handler.handle(raw, { prefix: "/api", context });
	expect(result.matched).toBe(true);
	return result.response!;
};

const actor = { kind: "human" as const, name: "navidkhan" };
const pageId = ulid();
const projectId = ulid();
const at = "2026-09-24T16:00:00.000Z";
const page = {
	id: pageId,
	projectId,
	projectKey: "WRT",
	ref: "WRT/pages/stable",
	slug: "stable",
	title: "Stable",
	summary: "",
	revision: 7,
	latestVersion: 1,
	creator: actor,
	actor,
	publishedBy: actor,
	publishedAt: at,
	watcher: null,
	pinned: false,
	openThreadCount: 0,
	deletedAt: null,
	deletedBy: null,
	purgeAt: null,
	createdAt: at,
	updatedAt: at,
	requestedVersion: {
		pageId,
		number: 1,
		requestId: crypto.randomUUID(),
		label: null,
		documentSha256: "a".repeat(64),
		documentSize: 1,
		sourceAgentId: null,
		sourcePath: "report/index.html",
		actor,
		createdAt: at,
	},
	assetCount: 0,
	totalThreadCount: 0,
	resolvedThreadCount: 0,
};

test("watch accepts a slash ref, validates an explicit agent, and requires an actor", async () => {
	const agentId = ulid();
	const body = JSON.stringify({ agentId });
	const response = await request(
		"/pages/watch/WRT/pages/stable",
		{
			method: "PUT",
			headers: { "content-type": "application/json", "x-trellis-actor": "human:navidkhan" },
			body,
		},
		async (name, _ctx, input) => {
			expect(name).toBe("pages.watch");
			expect(input).toEqual({ page: "WRT/pages/stable", agentId });
			return page;
		},
	);
	expect(response.status).toBe(200);
	const refused = await request(
		"/pages/watch/WRT/pages/stable",
		{
			method: "PUT",
			headers: { "content-type": "application/json" },
			body,
		},
		async () => {
			throw new Error("Must not dispatch without an actor");
		},
	);
	expect(refused.status).toBe(400);
});

test("watcher options accept a slash ref and return only IDs and names", async () => {
	const option = { id: ulid(), name: "Watcher" };
	const response = await request(
		"/pages/watcher-options/WRT/pages/stable",
		{
			method: "GET",
			headers: { "x-trellis-actor": "human:navidkhan" },
		},
		async (name, _ctx, input) => {
			expect(name).toBe("pages.watcherOptions");
			expect(input).toEqual({ page: "WRT/pages/stable" });
			return [option];
		},
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual([option]);
});
