import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvidenceWriteInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { ulid } from "ulid";
import type { Config } from "../../config.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Tx } from "../../db/tx.ts";
import { evidenceFileRoute } from "../../routes/evidenceFile.ts";
import { blobPath, tempDir } from "../../storage/blobs.ts";
import { gcBlobs } from "../blobs.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { list, prepareWrite, read, write } from "./evidence.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
const pullRequestId = ulid();
const actor = { name: "evidence-test", kind: "agent" as const };
const headSha = "0123456789abcdef";
const now = new Date("2026-09-20T12:00:00.000Z");
const events: unknown[] = [];

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const ctx = () =>
	({
		actor,
		home,
		maxUploadBytes: 1024,
		now: () => now,
		emit: (event: unknown) => events.push(event),
		gh: async () => ({ ok: true as const, code: 0, stdout: JSON.stringify({ headRefOid: headSha }), stderr: "" }),
		newTx: inTx,
	}) as unknown as IoCtx & PrepareCtx;

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-evidence-"));
	await mkdir(tempDir(home), { recursive: true });
	db = await openTestDb();
	await db.execute(sql`INSERT INTO pull_requests
		(id, owner, repo, number, url, state, head_sha, created_at, updated_at)
		VALUES (
			${pullRequestId}, 'example', 'trellis', 185, 'https://github.com/example/trellis/pull/185',
			'open', 'stale-head', ${now}, ${now}
		)`);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
	await rm(home, { recursive: true });
});

test("stores and reads one record for the current head SHA", async () => {
	const evidenceId = ulid();
	const prepared = await prepareWrite(ctx(), {
		id: pullRequestId,
		evidenceId,
		headSha,
		kind: "verify",
		record: { command: "bun test", exit: 0, tail: "3 pass" },
	});
	const stored = await inTx((tx) => write(ctx(), tx, prepared));

	expect(stored).toMatchObject({
		id: evidenceId,
		pullRequestId,
		headSha,
		kind: "verify",
		record: { command: "bun test", exit: 0, tail: "3 pass" },
		blob: null,
		actor,
	});
	expect(await inTx((tx) => read(ctx(), tx, { evidenceId }))).toEqual(stored);
	expect(await inTx((tx) => list(ctx(), tx, { id: pullRequestId }))).toEqual([stored]);
	expect(await inTx((tx) => write(ctx(), tx, prepared))).toEqual(stored);
	const conflict = await prepareWrite(ctx(), {
		id: pullRequestId,
		evidenceId,
		headSha,
		kind: "verify",
		record: { command: "bun test", exit: 1, tail: "1 fail" },
	});
	await expect(inTx((tx) => write(ctx(), tx, conflict))).rejects.toMatchObject({
		code: "DUPLICATE",
		status: 409,
		data: { field: "evidenceId" },
	});
	const current = await db.execute(sql`SELECT head_sha FROM pull_requests WHERE id = ${pullRequestId}`);
	expect(current.rows).toEqual([{ head_sha: headSha }]);
});

test("stores a capture record apart from the before image", async () => {
	const evidenceId = ulid();
	const record = {
		headSha,
		baseSha: "base-sha",
		route: "/reviews/185",
		viewport: "1440x900",
		theme: "dark",
		seed: "bun run seed",
		browser: "Aside",
		capturedAt: now.toISOString(),
	};
	const prepared = await prepareWrite(ctx(), {
		id: pullRequestId,
		evidenceId,
		headSha,
		kind: "capture",
		record,
	});
	const stored = await inTx((tx) => write(ctx(), tx, prepared));

	expect(stored).toMatchObject({ id: evidenceId, headSha, kind: "capture", record, blob: null });
});

test("requires the capture record head SHA to match its evidence row", async () => {
	const attempt = prepareWrite(ctx(), {
		id: pullRequestId,
		evidenceId: ulid(),
		headSha,
		kind: "capture",
		record: {
			headSha: "other-head",
			baseSha: "base-sha",
			route: "/reviews/185",
			viewport: "1440x900",
			theme: "dark",
			seed: "bun run seed",
			browser: "Aside",
			capturedAt: now.toISOString(),
		},
	});

	await expect(attempt).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["record.headSha"] }] },
	});
});

test("stores a file in the shared blob store", async () => {
	const evidenceId = ulid();
	const prepared = await prepareWrite(ctx(), {
		id: pullRequestId,
		evidenceId,
		headSha,
		kind: "picture",
		record: { why: "Show the write and read path." },
		file: new File(["picture"], "sequence.png", { type: "image/png" }),
	});
	const stored = await inTx((tx) => write(ctx(), tx, prepared));

	expect(stored.record).toEqual({
		why: "Show the write and read path.",
		file: { filename: "sequence.png", mime: "image/png", size: 7 },
	});
	expect(stored.blob).toMatchObject({
		url: `/api/evidence/${evidenceId}/file`,
		filename: "sequence.png",
		mime: "image/png",
		size: 7,
	});
	expect(existsSync(blobPath(home, stored.blob!.sha256))).toBe(true);
	expect(await gcBlobs(ctx(), [stored.blob!.sha256])).toEqual({ removed: [] });

	const app = new Hono();
	const transport = { call: async () => stored } as unknown as ServiceTransport;
	app.get("/:evidenceId", evidenceFileRoute({ config: { home } as Config, transport }));
	const response = await app.request(`/${evidenceId}`);
	const etag = `"${stored.blob!.sha256}"`;
	expect(response.headers.get("content-security-policy")).toBe("sandbox");
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	expect(response.headers.get("cache-control")).toBe("private, max-age=300");
	expect(response.headers.get("content-disposition")).toBe('inline; filename="sequence.png"');
	expect(response.headers.get("etag")).toBe(etag);
	expect(await response.text()).toBe("picture");
	const unchanged = await app.request(`/${evidenceId}`, { headers: { "if-none-match": etag } });
	expect(unchanged.status).toBe(304);
	expect(unchanged.headers.get("content-security-policy")).toBe("sandbox");
});

test("refuses a record for an old head SHA", async () => {
	const attempt = prepareWrite(ctx(), {
		id: pullRequestId,
		evidenceId: ulid(),
		headSha: "old-head",
		kind: "test",
		record: { none: true, reason: "No behavior changed." },
	});

	await expect(attempt).rejects.toMatchObject({
		code: "PR_HEAD_MOVED",
		status: 409,
		data: { currentHeadSha: headSha },
	});
});

test("requires the reason of a test none record", () => {
	const parsed = EvidenceWriteInputSchema.safeParse({
		id: pullRequestId,
		evidenceId: ulid(),
		headSha,
		kind: "test",
		record: { none: true, reason: "" },
	});

	expect(parsed.success).toBe(false);
});

test("requires a blob for a picture record", () => {
	const parsed = EvidenceWriteInputSchema.safeParse({
		id: pullRequestId,
		evidenceId: ulid(),
		headSha,
		kind: "picture",
		record: { why: "Show the call path." },
	});

	expect(parsed.success).toBe(false);
});
