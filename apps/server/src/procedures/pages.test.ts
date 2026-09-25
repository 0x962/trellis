import { beforeEach, describe, expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import {
	PAGE_RENDER_IDLE_MS,
	PAGE_RENDER_MAX_MS,
	type PageCommentThread,
	type PageDetail,
	type PageRenderLease,
} from "@trellis/api";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { createCache } from "../db/cache.ts";
import type { ServiceTransport } from "../db/transport.ts";
import type { Tx } from "../db/tx.ts";
import type { GhAccess } from "../ghState.ts";
import { clearPageLeases } from "../pageLeases.ts";
import { createDbTiming } from "../serverTiming.ts";
import { list as listPages } from "../services/pages/pages.ts";
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
const page: PageDetail = {
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

const json = (body: unknown, headers: Record<string, string> = {}) => ({
	headers: { "content-type": "application/json", "x-trellis-actor": "human:navidkhan", ...headers },
	body: JSON.stringify(body),
});

beforeEach(() => {
	clearPageLeases();
});

describe("Page procedures", () => {
	test("creates a render lease for the version the caller asked for", async () => {
		const calls: Array<{ name: ServiceName; input: unknown }> = [];
		const response = await request(
			"/pages/render/WRT/pages/stable",
			{ method: "POST", ...json({ version: 1 }) },
			async (name, _ctx, input) => {
				calls.push({ name, input });
				return page;
			},
		);
		expect(response.status).toBe(201);
		const lease = (await response.json()) as PageRenderLease;
		expect(calls).toEqual([{ name: "pages.get", input: { page: "WRT/pages/stable", version: 1 } }]);
		expect(lease.pageId).toBe(pageId);
		expect(lease.version).toBe(1);
		expect(lease.frameUrl).toBe(`/api/page-render/${lease.id}`);
		expect(lease.contentRoot).toBe(`/api/page-render/${lease.id}/`);
		expect(Date.parse(lease.absoluteExpiresAt) - Date.parse(lease.idleExpiresAt)).toBe(
			PAGE_RENDER_MAX_MS - PAGE_RENDER_IDLE_MS,
		);
	});

	test("renews a lease of the same actor and refuses one of another actor", async () => {
		const created = await request("/pages/render/WRT/pages/stable", { method: "POST", ...json({}) }, async () => page);
		const lease = (await created.json()) as PageRenderLease;
		const renewed = await request(
			"/page-render-leases/renew",
			{ method: "POST", ...json({ leaseId: lease.id }) },
			async () => page,
		);
		expect(renewed.status).toBe(200);
		expect(((await renewed.json()) as PageRenderLease).id).toBe(lease.id);
		const stranger = await request(
			"/page-render-leases/renew",
			{
				method: "POST",
				headers: { "content-type": "application/json", "x-trellis-actor": "human:other" },
				body: JSON.stringify({ leaseId: lease.id }),
			},
			async () => page,
		);
		expect(stranger.status).toBe(404);
		expect((await stranger.json()) as { code: string }).toMatchObject({ code: "RENDER_LEASE_EXPIRED" });
	});

	test("reads one version and its assets without a download link", async () => {
		const content = { page, version: page.requestedVersion, assets: [] };
		const response = await request("/pages/pull/WRT/pages/stable", {}, async () => content);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ version: { number: 1 } });
	});

	test("mints a download link of its own", async () => {
		const content = { page, version: page.requestedVersion, assets: [] };
		const response = await request(
			"/pages/archive/WRT/pages/stable",
			{ method: "POST", ...json({}) },
			async () => content,
		);
		expect(response.status).toBe(201);
		const link = (await response.json()) as { url: string; expiresAt: string };
		expect(link.url).toMatch(/^\/api\/page-archive\/[0-9a-f]{32}$/);
		expect(Date.parse(link.expiresAt)).toBeGreaterThan(Date.now());
	});

	test("matches slash refs on the restore and pin prefix routes", async () => {
		const calls: Array<{ name: ServiceName; input: unknown }> = [];
		const call: Call = async (name, _ctx, input) => {
			calls.push({ name, input });
			return name === "pages.pin" ? { pageId, pinned: true } : page;
		};
		expect(
			(await request("/pages/pin/WRT/pages/stable", { method: "PUT", ...json({ pinned: true }) }, call)).status,
		).toBe(200);
		expect(
			(await request("/pages/restore/WRT/pages/stable", { method: "POST", ...json({ expectedVersion: 7 }) }, call))
				.status,
		).toBe(200);
		expect(calls).toEqual([
			{ name: "pages.pin", input: { page: "WRT/pages/stable", pinned: true } },
			{ name: "pages.restore", input: { page: "WRT/pages/stable", expectedVersion: 7 } },
		]);
	});

	test("matches slash refs on Page comment routes", async () => {
		const threadId = ulid();
		const commentId = ulid();
		const thread: PageCommentThread = {
			id: threadId,
			pageId,
			version: 1,
			anchor: { kind: "element", path: "main" },
			selectedText: null,
			creator: actor,
			resolved: null,
			comments: [
				{
					id: commentId,
					threadId,
					body: "Check this chart.",
					actor,
					createdAt: at,
					updatedAt: at,
					deletedAt: null,
				},
			],
			createdAt: at,
			updatedAt: at,
		};
		const calls: Array<{ name: ServiceName; input: unknown }> = [];
		const call: Call = async (name, _ctx, input) => {
			calls.push({ name, input });
			return name === "pages.comments" ? [thread] : thread;
		};
		expect((await request("/page-comments/WRT/pages/stable", {}, call)).status).toBe(200);
		expect(
			(
				await request(
					"/page-comments/WRT/pages/stable",
					{
						method: "POST",
						...json({ version: 1, anchor: { kind: "element", path: "main" }, body: "Check this chart." }),
					},
					call,
				)
			).status,
		).toBe(201);
		expect(calls).toEqual([
			{ name: "pages.comments", input: { page: "WRT/pages/stable" } },
			{
				name: "pages.comment",
				input: {
					page: "WRT/pages/stable",
					version: 1,
					anchor: { kind: "element", path: "main" },
					body: "Check this chart.",
				},
			},
		]);
	});

	test("sends the revision as an ETag and passes a valid GET actor", async () => {
		let readActor: unknown;
		const response = await request(
			"/pages/WRT/pages/stable",
			{ headers: { "x-trellis-actor": "human:navidkhan" } },
			async (_name, ctx) => {
				readActor = ctx.actor;
				return page;
			},
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("etag")).toBe('"7"');
		expect(readActor).toEqual(actor);
	});

	test("keeps an anonymous unfiltered GET and ignores a malformed GET actor", async () => {
		const actors: unknown[] = [];
		const call: Call = async (_name, ctx) => {
			actors.push(ctx.actor);
			return { items: [], nextCursor: null };
		};
		expect((await request("/pages?project=WRT", {}, call)).status).toBe(200);
		expect((await request("/pages?project=WRT", { headers: { "x-trellis-actor": "invalid" } }, call)).status).toBe(200);
		expect(actors).toEqual([null, null]);
	});

	test("refuses both pinned filters when a malformed GET actor becomes null", async () => {
		const cache = createCache();
		const call: Call = async (_name, ctx, input) =>
			listPages(
				{
					...ctx,
					emit: () => {},
					cache,
					actorCache: new Map(),
					dropBlobs: () => {},
					publicUrl: "http://trellis.test",
				} satisfies ServiceCtx,
				{} as Tx,
				input,
			);
		for (const pinned of ["true", "false"]) {
			const response = await request(
				`/pages?project=WRT&pinned=${pinned}`,
				{ headers: { "x-trellis-actor": "invalid" } },
				call,
			);
			expect(response.status).toBe(400);
			expect((await response.json()) as { code: string }).toMatchObject({ code: "ACTOR_REQUIRED" });
		}
	});

	test("requires expectedVersion in each Page write body", async () => {
		let called = false;
		for (const [path, init] of [
			["/pages/WRT/pages/stable", { method: "PATCH", ...json({ title: "Changed" }, { "if-match": '"7"' }) }],
			["/pages/WRT/pages/stable", { method: "DELETE", ...json({ force: false }, { "if-match": '"7"' }) }],
			["/pages/restore/WRT/pages/stable", { method: "POST", ...json({ force: false }, { "if-match": '"7"' }) }],
		] as const) {
			const response = await request(path, init, async () => {
				called = true;
				return page;
			});
			expect(response.status).toBe(400);
		}
		expect(called).toBe(false);
	});

	test("accepts a matching If-Match header and rejects a mismatch", async () => {
		let input: unknown;
		const matching = await request(
			"/pages/WRT/pages/stable",
			{
				method: "PATCH",
				...json({ title: "Changed", expectedVersion: 7 }),
				headers: {
					"content-type": "application/json",
					"x-trellis-actor": "human:navidkhan",
					"if-match": '"7"',
				},
			},
			async (_name, _ctx, value) => {
				input = value;
				return page;
			},
		);
		expect(matching.status).toBe(200);
		expect(input).toMatchObject({ expectedVersion: 7 });
		const mismatch = await request(
			"/pages/WRT/pages/stable",
			{
				method: "PATCH",
				...json({ title: "Changed", expectedVersion: 7 }),
				headers: {
					"content-type": "application/json",
					"x-trellis-actor": "human:navidkhan",
					"if-match": '"6"',
				},
			},
			async () => page,
		);
		expect(mismatch.status).toBe(400);
		expect((await mismatch.json()) as { code: string }).toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	});

	test("keeps the mutation actor boundary", async () => {
		for (const [headers, code] of [
			[{ "content-type": "application/json" }, "ACTOR_REQUIRED"],
			[{ "content-type": "application/json", "x-trellis-actor": "invalid" }, "ACTOR_INVALID"],
		] as const) {
			const response = await request(
				"/pages/WRT/pages/stable",
				{ method: "PATCH", headers, body: JSON.stringify({ title: "Changed", expectedVersion: 7 }) },
				async () => page,
			);
			expect(response.status).toBe(400);
			expect((await response.json()) as { code: string }).toMatchObject({ code });
		}
	});
});
