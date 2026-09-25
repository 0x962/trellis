import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { PageCleanupCtx } from "../context.ts";
import { collectUnheldPageObjects } from "../services/pages/pages.ts";
import { publish } from "../services/pages/publish.ts";
import { prepareUpload, upload } from "../services/pages/uploads.ts";
import type { IoCtx, PrepareCtx } from "../services/support.ts";
import { createCache } from "./cache.ts";
import { openDb } from "./client.ts";
import { migratedTar } from "./testDb.ts";
import type { Tx } from "./tx.ts";

export const pageHomeFixture = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-page-home-"));
	const db = await openDb(join(home, "db"), await migratedTar());
	await mkdir(join(home, "attachments"), { recursive: true });
	const cache = createCache();
	const tasks: Array<() => Promise<void>> = [];
	const logs: Array<{ message: string; fields: Record<string, unknown> | undefined }> = [];
	const actor = { name: "Page owner", kind: "human" as const };
	const at = new Date("2026-09-25T12:00:00Z");
	const newTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
	const core: PageCleanupCtx = {
		actor,
		session: null,
		reqId: ulid(),
		now: at,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://trellis.test",
		dropPageObjects: (shas) => {
			tasks.push(() => collectUnheldPageObjects({ home, newTx }, shas).then(() => {}));
		},
	};
	const ctx: IoCtx & PrepareCtx = {
		core,
		actor,
		session: null,
		home,
		now: () => core.now,
		newTx,
		maxUploadBytes: 100 * 1024 * 1024,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		localUrl: "http://trellis.test",
		publicUrl: "http://trellis.test",
		ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: at.toISOString() }),
		addresses: async () => [],
		log: (message, fields) => {
			logs.push({ message, fields });
		},
		emit: () => {},
		afterCommit: (task) => {
			tasks.push(task);
		},
		vacuum: async () => {},
		background: () => {
			throw new Error("Unexpected background task");
		},
		gh: Object.assign(
			async () => {
				throw new Error("Unexpected gh call");
			},
			{ bin: "gh", timeoutMs: 1000 },
		),
	};
	const flush = async () => {
		for (const task of tasks.splice(0)) await task();
	};
	const project = async (key: string) => {
		const id = ulid();
		await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
			VALUES (${id}, ${key}, ${key.toLowerCase()}, ${key}, ${at}, ${at})`);
		await newTx(cache.rebuild);
		return id;
	};
	const stage = async (project: string, body: string, name = "index.html", type = "text/html") => {
		const input = await prepareUpload(ctx, { project, file: new File([body], name, { type }) });
		return newTx((tx) => upload(ctx, tx, input));
	};
	const page = async (project: string, title: string, body = "<h1>Page</h1>", asset = "body{}") => {
		const document = await stage(project, body);
		const style = await stage(project, asset, "style.css", "text/css");
		const result = await newTx((tx) =>
			publish(core, tx, {
				project,
				title,
				document: document.id,
				assets: [{ uploadId: style.id, path: "style.css" }],
				requestId: crypto.randomUUID(),
				sourcePath: "index.html",
			}),
		);
		return { ...result, document, style };
	};
	return {
		home,
		db,
		core,
		ctx,
		at,
		logs,
		tasks,
		newTx,
		flush,
		project,
		stage,
		page,
		close: async () => {
			await db.$client.close();
			await rm(home, { recursive: true, force: true });
		},
	};
};
