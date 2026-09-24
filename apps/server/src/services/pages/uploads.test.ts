import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGE_ASSET_MAX_BYTES, PageUploadInputSchema, PageUploadSchema, type ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { gcPageObjects, pageObjectPath, pageTempPath } from "../../storage/pageObjects.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { PAGE_UPLOAD_TTL_MS, prepareUpload, upload } from "./uploads.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
const cache = createCache();
const at = new Date("2026-09-24T20:00:00.000Z");
const projectId = ulid();
const otherProjectId = ulid();
const archivedProjectId = ulid();
const human = { name: "Navid", kind: "human" as const };
const otherActor = { name: "Page agent", kind: "agent" as const };

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const contextOf = (actor: ActorRef) =>
	({
		core: {
			actor,
			session: null,
			reqId: ulid(),
			now: at,
			emit: () => {},
			cache,
			actorCache: new Map(),
			dropBlobs: () => {},
			publicUrl: "http://trellis.test",
		},
		actor,
		session: null,
		home,
		maxUploadBytes: 50 * 1024 * 1024,
		now: () => at,
		newTx: inTx,
		afterCommit: () => {},
	}) as unknown as IoCtx & PrepareCtx;

const stageAndStore = async (actor: ActorRef, input: unknown) => {
	const ctx = contextOf(actor);
	const prepared = await prepareUpload(ctx, input);
	return inTx((tx) => upload(ctx, tx, prepared));
};

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-uploads-"));
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, archived_at, created_at, updated_at) VALUES
		(${projectId}, 'PAG', 'page-project', 'Pages', NULL, ${at}, ${at}),
		(${otherProjectId}, 'OTH', 'other', 'Other', NULL, ${at}, ${at}),
		(${archivedProjectId}, 'ARC', 'archive', 'Archive', ${at}, ${at}, ${at})`);
	await inTx(cache.rebuild);
}, 30_000);

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

test("stores empty CSS and JavaScript uploads for 24 hours", async () => {
	const cssId = ulid();
	const css = await stageAndStore(human, {
		id: cssId,
		project: "PAG",
		file: new File([], "empty.css", { type: "TEXT/CSS; charset=utf-8" }),
	});
	const script = await stageAndStore(human, {
		project: "PAG",
		file: new File([], "empty.js", { type: "text/javascript" }),
	});

	expect(PageUploadSchema.parse(css)).toMatchObject({
		id: cssId,
		projectId,
		size: 0,
		mime: "text/css",
		originalName: "empty.css",
		actor: human,
		createdAt: at.toISOString(),
		expiresAt: new Date(at.getTime() + PAGE_UPLOAD_TTL_MS).toISOString(),
	});
	expect(script).toMatchObject({ size: 0, mime: "text/javascript", originalName: "empty.js" });
	expect(existsSync(pageObjectPath(home, css.sha256))).toBe(true);
	expect(existsSync(join(home, "attachments", css.sha256.slice(0, 2), css.sha256))).toBe(false);
	expect(existsSync(pageTempPath(home, cssId))).toBe(false);
});

test("stores an overlong MIME type as application/octet-stream", async () => {
	const upload = await stageAndStore(human, {
		project: projectId,
		file: new File(["bytes"], "asset.bin", { type: `application/${"x".repeat(300)}` }),
	});

	expect(upload.mime).toBe("application/octet-stream");
});

test("returns one staged upload for a repeated id and the same input", async () => {
	const id = ulid();
	const input = {
		id,
		project: projectId,
		file: new File(["body {}"], "site.css", { type: "text/css" }),
	};
	const first = await stageAndStore(human, input);
	const second = await stageAndStore(human, input);
	const rows = await db.execute(sql`SELECT id FROM page_uploads WHERE id = ${id}`);

	expect(second).toEqual(first);
	expect(rows.rows).toEqual([{ id }]);
});

test("releases an object for collection after the upload row rolls back", async () => {
	const ctx = contextOf(human);
	const prepared = await prepareUpload(ctx, {
		project: projectId,
		file: new File(["rolled back"], "rollback.txt", { type: "text/plain" }),
	});

	await expect(
		inTx(async (tx) => {
			await upload(ctx, tx, prepared);
			throw new Error("rollback");
		}),
	).rejects.toThrow("rollback");
	expect(existsSync(pageObjectPath(home, prepared.staged.sha256))).toBe(true);
	expect(await gcPageObjects(home, [prepared.staged.sha256], async () => false)).toEqual({
		removed: [prepared.staged.sha256],
	});
});

test("keeps an upload when collection starts before its transaction commits", async () => {
	const ctx = contextOf(human);
	const prepared = await prepareUpload(ctx, {
		project: projectId,
		file: new File(["commit race"], "commit-race.txt", { type: "text/plain" }),
	});
	const holderStarted = Promise.withResolvers<void>();
	let collection: ReturnType<typeof gcPageObjects> | undefined;

	await inTx(async (tx) => {
		await upload(ctx, tx, prepared);
		collection = gcPageObjects(home, [prepared.staged.sha256], async (sha256) => {
			holderStarted.resolve();
			return inTx(async (holderTx) => {
				const held = await holderTx.execute(sql`SELECT id FROM page_uploads WHERE sha256 = ${sha256} LIMIT 1`);
				return held.rows.length > 0;
			});
		});
		await holderStarted.promise;
	});

	expect(await collection).toEqual({ removed: [] });
	expect(existsSync(pageObjectPath(home, prepared.staged.sha256))).toBe(true);
});

test("binds a staged upload id to its project, actor, and bytes", async () => {
	const id = ulid();
	const file = new File(["shared"], "shared.txt", { type: "text/plain" });
	await stageAndStore(human, { id, project: projectId, file });

	for (const [actor, project, nextFile] of [
		[otherActor, projectId, file],
		[human, otherProjectId, file],
		[human, projectId, new File(["changed"], "shared.txt", { type: "text/plain" })],
	] as const) {
		await expect(stageAndStore(actor, { id, project, file: nextFile })).rejects.toMatchObject({
			code: "INPUT_VALIDATION_FAILED",
		});
		expect(existsSync(pageTempPath(home, id))).toBe(false);
	}

	expect(await stageAndStore(human, { id, project: projectId, file })).toMatchObject({ id, projectId });
});

test("refuses an upload over the Page asset limit before it writes a file", async () => {
	const id = ulid();
	const file = new File([], "large.bin", { type: "application/octet-stream" });
	Object.defineProperty(file, "size", { value: PAGE_ASSET_MAX_BYTES + 1 });

	await expect(prepareUpload(contextOf(human), { id, project: projectId, file })).rejects.toMatchObject({
		code: "PAYLOAD_TOO_LARGE",
		data: { maxBytes: PAGE_ASSET_MAX_BYTES },
	});
	expect(existsSync(pageTempPath(home, id))).toBe(false);
});

test("refuses an archived project before it writes a file", async () => {
	const id = ulid();
	await expect(
		prepareUpload(contextOf(human), {
			id,
			project: archivedProjectId,
			file: new File(["blocked"], "blocked.html", { type: "text/html" }),
		}),
	).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
	expect(existsSync(pageTempPath(home, id))).toBe(false);
});

test("refuses an invalid upload name", () => {
	for (const name of ["nested/file.css", "nested\\file.css", "bad\u001fname.css", "x".repeat(256)]) {
		expect(
			PageUploadInputSchema.safeParse({
				project: projectId,
				file: new File([], name, { type: "text/css" }),
			}).success,
		).toBe(false);
	}
});
