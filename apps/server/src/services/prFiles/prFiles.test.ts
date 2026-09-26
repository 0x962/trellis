import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { ulid } from "ulid";
import { hostAuth } from "../../auth/auth.ts";
import type { Config } from "../../config.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Tx } from "../../db/tx.ts";
import { prFileRoute } from "../../routes/prFile.ts";
import { blobPath, tempDir } from "../../storage/blobs.ts";
import { gcBlobs } from "../blobs.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { prepareUpload, read, upload } from "./prFiles.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
const pullRequestId = ulid();
const actor = { name: "pr-files-test", kind: "agent" as const };
const now = new Date("2026-09-20T12:00:00.000Z");

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const ctx = () => ({ actor, home, maxUploadBytes: 1024, now: () => now, newTx: inTx }) as unknown as IoCtx & PrepareCtx;

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-pr-files-"));
	await mkdir(tempDir(home), { recursive: true });
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, head_sha, created_at, updated_at)
		VALUES (
			${pullRequestId}, 'example', 'trellis', 185, 'https://github.com/example/trellis/pull/185',
			'open', 'head', ${now}, ${now}
		)`);
}, 30_000);

// The directory goes before the database closes, because a failed close
// would otherwise leave it in the temporary directory.
afterAll(async () => {
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

test("stores a file in the shared blob store and serves it", async () => {
	const fileId = ulid();
	const file = new File(["picture"], "overview.png", { type: "image/png" });
	const prepared = await prepareUpload(ctx(), { id: pullRequestId, fileId, file });
	const stored = await inTx((tx) => upload(ctx(), tx, prepared));

	expect(stored).toMatchObject({
		id: fileId,
		pullRequestId,
		url: `/api/evidence/${fileId}/file`,
		filename: "overview.png",
		mime: "image/png",
		size: 7,
	});
	expect(await inTx((tx) => read(ctx(), tx, { fileId }))).toEqual(stored);
	expect(existsSync(blobPath(home, stored.sha256))).toBe(true);
	expect(await gcBlobs(ctx(), [stored.sha256])).toEqual({ removed: [] });
	const repeated = await prepareUpload(ctx(), { id: pullRequestId, fileId, file });
	const again = await inTx((tx) => upload(ctx(), tx, repeated));
	expect(again).toEqual(stored);

	const app = new Hono();
	const transport = { call: async () => stored } as unknown as ServiceTransport;
	app.use("*", hostAuth("host-token"));
	app.get("/api/evidence/:fileId/file", prFileRoute({ config: { home } as Config, transport }));
	const unauthorized = await app.request(`/api/evidence/${fileId}/file`);
	expect(unauthorized.status).toBe(401);
	const response = await app.request(`/api/evidence/${fileId}/file`, {
		headers: { authorization: "Bearer host-token" },
	});
	const etag = `"${stored.sha256}"`;
	expect(response.headers.get("content-security-policy")).toBe("sandbox");
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	expect(response.headers.get("cache-control")).toBe("private, max-age=300");
	expect(response.headers.get("content-disposition")).toBe('inline; filename="overview.png"');
	expect(response.headers.get("etag")).toBe(etag);
	expect(await response.text()).toBe("picture");
	const unchanged = await app.request(`/api/evidence/${fileId}/file`, {
		headers: { authorization: "Bearer host-token", "if-none-match": etag },
	});
	expect(unchanged.status).toBe(304);
});

test("refuses a second upload that reuses a file id for other bytes", async () => {
	const fileId = ulid();
	const first = new File(["one"], "one.png", { type: "image/png" });
	const one = await prepareUpload(ctx(), { id: pullRequestId, fileId, file: first });
	await inTx((tx) => upload(ctx(), tx, one));
	const other = new File(["two"], "two.png", { type: "image/png" });
	const prepared = await prepareUpload(ctx(), { id: pullRequestId, fileId, file: other });
	await expect(inTx((tx) => upload(ctx(), tx, prepared))).rejects.toMatchObject({
		code: "DUPLICATE",
		data: { field: "fileId" },
	});
});

test("stores an animated image with its media type", async () => {
	const fileId = ulid();
	const file = new File(["GIF89a"], "states.gif", { type: "image/gif" });
	const prepared = await prepareUpload(ctx(), { id: pullRequestId, fileId, file });
	const stored = await inTx((tx) => upload(ctx(), tx, prepared));

	expect(stored).toMatchObject({ filename: "states.gif", mime: "image/gif", size: 6 });
	expect(existsSync(blobPath(home, stored.sha256))).toBe(true);
});

test("refuses a file over the upload cap", async () => {
	const file = new File(["x".repeat(2048)], "big.png", { type: "image/png" });
	await expect(prepareUpload(ctx(), { id: pullRequestId, fileId: ulid(), file })).rejects.toMatchObject({
		code: "PAYLOAD_TOO_LARGE",
	});
});

test("answers not found for an unknown file", async () => {
	await expect(inTx((tx) => read(ctx(), tx, { fileId: ulid() }))).rejects.toMatchObject({ code: "NOT_FOUND" });
});
