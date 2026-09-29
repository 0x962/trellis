import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ResourceAddInputSchema, ResourceUpdateInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { ulid } from "ulid";
import type { Config } from "../../config.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Tx } from "../../db/tx.ts";
import type { ProcedureContext } from "../../procedures/base.ts";
import { resources as procedures } from "../../procedures/resources.ts";
import { resourceBlobRoute } from "../../routes/resourceBlob.ts";
import { createDbTiming } from "../../serverTiming.ts";
import { blobPath, tempDir } from "../../storage/blobs.ts";
import { gcBlobs } from "../blobs.ts";
import { epicView } from "../epics/epics.ts";
import type { IoCtx } from "../support.ts";
import { add, get, list, readBlob, remove, update } from "./resources.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
let context: IoCtx;
const actor = { name: "resource-test", kind: "agent" as const };
const projectId = ulid();
const statusId = ulid();
const epicId = ulid();
const ticketId = ulid();
const now = new Date("2026-09-20T22:30:00.000Z");
const afterCommit: Array<() => Promise<void>> = [];

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-resources-"));
	await mkdir(tempDir(home), { recursive: true });
	db = await openTestDb();
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${actor.name}, ${actor.kind}, ${now}, ${now})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'TRL', 'trl', 'Trellis', ${now}, ${now})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, color, position, is_default, created_at, updated_at
	) VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'gray', 0, true, ${now}, ${now})`);
	await db.execute(sql`INSERT INTO epics (
		id, project_id, slug, name, actor_name, actor_kind, created_at, updated_at, actor_id) VALUES (${epicId}, ${projectId}, 'resources', 'Resources', ${actor.name}, ${actor.kind}, ${now}, ${now}, (SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY[${actor.kind}, ${actor.name}]::text[]))`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, number, title, status_id, epic_id, position, created_at, updated_at
	) VALUES (${ticketId}, ${projectId}, 196, 'Add resources', ${statusId}, ${epicId}, 1024, ${now}, ${now})`);
	const cache = createCache();
	await inTx(cache.rebuild);
	const core = {
		actor,
		session: null,
		reqId: ulid(),
		now,
		emit: () => {},
		cache,
		actorCache: new Map(),
		dropBlobs: () => {},
		publicUrl: "http://127.0.0.1:4521",
	};
	context = {
		actor,
		session: null,
		home,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		now: () => now,
		ghStatus: () => ({ ok: true }),
		addresses: async () => [],
		emit: () => {},
		afterCommit: (task: () => Promise<void>) => afterCommit.push(task),
		newTx: inTx,
		vacuum: async () => {},
		core,
		localUrl: "http://127.0.0.1:4521",
		publicUrl: "http://127.0.0.1:4521",
		background: () => {},
	} as unknown as IoCtx;
}, 30_000);

// The directory goes before the database closes, because a failed close
// would otherwise leave it in the temporary directory.
afterAll(async () => {
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

test("stores a doc without a blob", async () => {
	const body = "a".repeat(200_000);
	const resource = await inTx((tx) =>
		add(context, tx, { epic: "TRL/resources", kind: "doc", name: "Plan", body, ticket: "TRL-196" }),
	);

	expect(resource).toMatchObject({ kind: "doc", name: "Plan", body, url: null, blob: null, ticketId });
	expect((await inTx((tx) => epicView(context.core, tx, epicId))).resourceCount).toBe(1);
	expect(
		ResourceAddInputSchema.safeParse({ epic: "TRL/resources", kind: "doc", name: "Plan", body: `${body}a` }).success,
	).toBe(false);

	const saved = await inTx((tx) => update(context, tx, { id: resource.id, body: "# Updated plan" }));
	expect(saved).toMatchObject({ id: resource.id, body: "# Updated plan", updatedAt: now.toISOString() });
	expect(ResourceUpdateInputSchema.safeParse({ id: resource.id, body: `${body}a` }).success).toBe(false);
});

test("stores a doc with an empty title, then renames it and keeps its body", async () => {
	const resource = await inTx((tx) => add(context, tx, { epic: "TRL/resources", kind: "doc", name: "", body: "" }));
	expect(resource).toMatchObject({ kind: "doc", name: "", body: "" });

	const renamed = await inTx((tx) => update(context, tx, { id: resource.id, name: "  Research notes " }));
	expect(renamed).toMatchObject({ name: "Research notes", body: "" });
	const typed = await inTx((tx) => update(context, tx, { id: resource.id, body: "First line" }));
	expect(typed).toMatchObject({ name: "Research notes", body: "First line" });

	expect(
		ResourceAddInputSchema.safeParse({ epic: "TRL/resources", kind: "link", name: "", url: "https://a.b" }).success,
	).toBe(false);
	await expect(
		db.execute(sql`INSERT INTO epic_resources (id, epic_id, kind, name, url, actor_name, actor_kind, created_at, updated_at, actor_id)
			VALUES (${ulid()}, ${epicId}, 'link', '', 'https://a.b', ${actor.name}, ${actor.kind}, ${now}, ${now}, (SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY[${actor.kind}, ${actor.name}]::text[]))`),
	).rejects.toThrow("epic_resources_name_check");
});

test("stores a link without a blob", async () => {
	const resource = await inTx((tx) =>
		add(context, tx, {
			epic: "TRL/resources",
			kind: "link",
			name: "Pull request",
			url: "https://github.com/0x962/trellis/pull/196",
		}),
	);

	expect(resource).toMatchObject({ kind: "link", url: "https://github.com/0x962/trellis/pull/196", blob: null });
	await expect(inTx((tx) => update(context, tx, { id: resource.id, body: "not a document" }))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});

test("stores an image and returns the pull request that shows it", async () => {
	const resource = await inTx((tx) =>
		add(context, tx, {
			epic: "TRL/resources",
			kind: "image",
			name: "migration.png",
			file: new File(["image"], "migration.png", { type: "image/png" }),
		}),
	);
	const pullRequestId = ulid();
	await db.execute(sql`INSERT INTO pull_requests (
		id, owner, repo, number, url, state, head_sha, created_at, updated_at
	) VALUES (
		${pullRequestId}, '0x962', 'trellis', 196, 'https://github.com/0x962/trellis/pull/196',
		'open', 'head', ${now}, ${now}
	)`);
	await db.execute(sql`INSERT INTO pr_files (
		id, pull_request_id, blob_sha256, filename, mime, size, actor_name, actor_kind, created_at, actor_id) VALUES (
		${ulid()}, ${pullRequestId}, ${resource.blob!.sha256}, 'migration.png', 'image/png', 5,
		${actor.name}, ${actor.kind}, ${now}, (SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY[${actor.kind}, ${actor.name}]::text[]))`);
	await db.execute(sql`INSERT INTO ticket_pull_requests (
		ticket_id, pull_request_id, source, actor_name, actor_kind, created_at, actor_id) VALUES (${ticketId}, ${pullRequestId}, 'manual', ${actor.name}, ${actor.kind}, ${now}, (SELECT id FROM actors WHERE ARRAY[kind, name] = ARRAY[${actor.kind}, ${actor.name}]::text[]))`);

	const found = await inTx((tx) => list(context, tx, { epic: epicId }));
	expect(found.find((item) => item.id === resource.id)).toMatchObject({
		kind: "image",
		blob: { size: 5, url: `/api/resources/${resource.id}/blob` },
		pullRequestNumber: 196,
	});

	const transport = {
		call: async (_name: string, _ctx: unknown, input: unknown) => inTx((tx) => readBlob(context, tx, input)),
	} as unknown as ServiceTransport;
	const app = new Hono();
	app.get("/:id", resourceBlobRoute({ config: { home } as Config, transport }));
	const response = await app.request(`/${resource.id}`);
	expect(response.headers.get("cache-control")).toBe("private, max-age=300");
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	expect(response.headers.get("content-security-policy")).toBe("sandbox");
	expect(response.headers.get("content-type")).toBe("image/png");
	expect(await response.text()).toBe("image");
	await unlink(blobPath(home, resource.blob!.sha256));
	expect(
		(await inTx((tx) => list(context, tx, { epic: epicId }))).find((item) => item.id === resource.id)?.blob?.size,
	).toBe(5);
});

test("stores and removes a file", async () => {
	const body = "x".repeat(2048);
	const resource = await inTx((tx) =>
		add(context, tx, {
			epic: "TRL/resources",
			kind: "file",
			name: "migration.mmd",
			file: new File([body], "migration.mmd", { type: "text/plain" }),
		}),
	);
	const path = blobPath(home, resource.blob!.sha256);
	expect(await inTx((tx) => readBlob(context, tx, { id: resource.id }))).toMatchObject({
		mime: "text/plain",
		size: body.length,
	});
	expect(existsSync(path)).toBe(true);
	expect(await gcBlobs(context, [resource.blob!.sha256])).toEqual({ removed: [] });
	expect(await inTx((tx) => remove(context, tx, { id: resource.id }))).toEqual({ deleted: resource.id });
	for (const task of afterCommit.splice(0)) await task();
	expect(existsSync(path)).toBe(false);
});

test("pages resources in stable order and reads a target outside the page by ID", async () => {
	const target = await inTx((tx) =>
		add(context, tx, { epic: epicId, kind: "file", name: "target.txt", file: new File(["target"], "target.txt") }),
	);
	const all = await inTx((tx) => list(context, tx, { epic: epicId }));
	const first = await inTx((tx) => list(context, tx, { epic: epicId, limit: 1, offset: 0 }));
	const second = await inTx((tx) => list(context, tx, { epic: epicId, limit: 1, offset: 1 }));
	expect(first).toEqual(all.slice(0, 1));
	expect(second).toEqual(all.slice(1, 2));
	expect(first.some((resource) => resource.id === target.id)).toBe(false);
	expect(await inTx((tx) => get(context, tx, { id: target.id }))).toEqual(target);
	await expect(inTx((tx) => get(context, tx, { id: ulid() }))).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("serves a resource link target and a bounded list through the HTTP routes", async () => {
	const resource = await inTx((tx) =>
		add(context, tx, { epic: epicId, kind: "doc", name: "Route target", body: "Target document" }),
	);
	const handler = new OpenAPIHandler({ resources: procedures });
	const request = async (path: string) => {
		const raw = new Request(`http://trellis.test/api${path}`);
		const result = await handler.handle(raw, {
			prefix: "/api",
			context: {
				headers: raw.headers,
				reqId: ulid(),
				actor: null,
				timing: createDbTiming(),
				transport: {
					call: (name: string, _ctx: unknown, input: unknown) => {
						if (name === "resources.get") return inTx((tx) => get(context, tx, input));
						if (name === "resources.list") return inTx((tx) => list(context, tx, input));
						throw new Error(name);
					},
				},
			} as ProcedureContext,
		});
		return result.response!;
	};
	const response = await request(`/resources/${resource.id}`);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(resource);
	const page = await request(`/resources?epic=${epicId}&limit=1&offset=1`);
	expect(page.status).toBe(200);
	expect(await page.json()).toHaveLength(1);
	expect((await request(`/resources/${ulid()}`)).status).toBe(404);
});
