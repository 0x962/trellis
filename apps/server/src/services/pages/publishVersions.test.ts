import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActorRef, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { pull, versions } from "./content.ts";
import { get } from "./pages.ts";
import { preparePublish, publish } from "./publish.ts";
import { prepareUpload, upload } from "./uploads.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
const cache = createCache();
const events: TrellisEvent[] = [];
const at = new Date("2026-09-24T18:00:00.000Z");
const human = { name: "Navid", kind: "human" as const };
const project = { id: ulid(), key: "PUB", slug: "publish" };

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const contextOf = (actor: ActorRef): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now: at,
	emit: (event) => events.push(event),
	cache,
	actorCache: new Map(),
	dropBlobs: () => {},
	publicUrl: "http://trellis.test",
});

const ioContextOf = (actor: ActorRef) =>
	({
		core: contextOf(actor),
		actor,
		session: null,
		home,
		maxUploadBytes: 50 * 1024 * 1024,
		now: () => at,
		log: () => {},
		newTx: inTx,
		afterCommit: () => {},
	}) as unknown as IoCtx & PrepareCtx;

const stage = async (actor: ActorRef, file: File) => {
	const ctx = ioContextOf(actor);
	const prepared = await prepareUpload(ctx, { project: project.key, file });
	return (await inTx((tx) => upload(ctx, tx, prepared))).id;
};

const html = (body: string) => new File([body], "index.html", { type: "text/html" });

const publishIn = async (actor: ActorRef, input: Record<string, unknown>) => {
	const ctx = ioContextOf(actor);
	const prepared = await preparePublish(ctx, input);
	return inTx((tx) => publish(ctx, tx, prepared));
};

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-publish-versions-"));
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${project.id}, ${project.key}, ${project.slug}, ${project.key}, ${at}, ${at})`);
	await inTx(cache.rebuild);
}, 30_000);

afterAll(async () => {
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

describe("a second publication", () => {
	test("adds a version, keeps the first one, and raises the revision", async () => {
		const first = await stage(human, html("<p>One</p>"));
		const page = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Weekly status",
			document: first,
			sourcePath: "status/index.html",
		});
		const second = await stage(human, html("<p>Two</p>"));
		const next = await publishIn(human, {
			requestId: crypto.randomUUID(),
			page: page.page.ref,
			expectedVersion: page.page.revision,
			summary: "The status of week two.",
			document: second,
			sourcePath: "status/index.html",
		});
		expect(next.version.number).toBe(2);
		expect(next.page.latestVersion).toBe(2);
		expect(next.page.revision).toBe(page.page.revision + 1);
		expect(next.page.summary).toBe("The status of week two.");
		expect(next.page.slug).toBe(page.page.slug);

		const history = await inTx((tx) => versions(contextOf(human), tx, { page: page.page.ref }));
		expect(history.items.map((version) => version.number)).toEqual([2, 1]);
		expect(history.nextCursor).toBeNull();
		const older = await inTx((tx) => pull(contextOf(human), tx, { page: page.page.ref, version: 1 }));
		expect(older.version.documentSha256).toBe(page.version.documentSha256);
	});

	test("refuses a stale revision and writes no version", async () => {
		const first = await stage(human, html("<p>Base</p>"));
		const page = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Stale check",
			document: first,
			sourcePath: "index.html",
		});
		const second = await stage(human, html("<p>Stale</p>"));
		await expect(
			publishIn(human, {
				requestId: crypto.randomUUID(),
				page: page.page.ref,
				expectedVersion: page.page.revision + 1,
				document: second,
				sourcePath: "index.html",
			}),
		).rejects.toThrow("The page changed since the revision you sent.");
		const detail = await inTx((tx) => get(contextOf(human), tx, { page: page.page.ref }));
		expect(detail.latestVersion).toBe(1);
	});

	test("returns the first result when the same request arrives twice", async () => {
		const document = await stage(human, html("<p>Once</p>"));
		const input = {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Idempotent report",
			document,
			sourcePath: "index.html",
		};
		const created = await publishIn(human, input);
		// The first call consumed the staged upload, so the retry names a row
		// that is gone. It reads the version the first call created.
		const repeated = await publishIn(human, input);
		expect(repeated.page.id).toBe(created.page.id);
		expect(repeated.version.number).toBe(1);
		expect(repeated.version.documentSha256).toBe(created.version.documentSha256);
		const pages = await db.execute(
			sql`SELECT id FROM pages WHERE project_id = ${project.id} AND title = 'Idempotent report'`,
		);
		expect(pages.rows.length).toBe(1);
	});

	test("refuses other bytes under a request identifier it already holds", async () => {
		const document = await stage(human, html("<p>First bytes</p>"));
		const requestId = crypto.randomUUID();
		const created = await publishIn(human, {
			requestId,
			project: project.key,
			title: "Reused identifier",
			document,
			sourcePath: "index.html",
		});
		const other = await stage(human, html("<p>Other bytes</p>"));
		await expect(
			publishIn(human, {
				requestId,
				project: project.key,
				title: "Reused identifier",
				document: other,
				sourcePath: "index.html",
			}),
		).rejects.toThrow("A row with this value exists.");
		const detail = await inTx((tx) => get(contextOf(human), tx, { page: created.page.ref }));
		expect(detail.latestVersion).toBe(1);
	});

	test("refuses a request identifier that belongs to another page", async () => {
		const first = await stage(human, html("<p>Page one</p>"));
		const one = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Identifier page one",
			document: first,
			sourcePath: "index.html",
		});
		const second = await stage(human, html("<p>Page two</p>"));
		const two = await publishIn(human, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Identifier page two",
			document: second,
			sourcePath: "index.html",
		});
		await expect(
			publishIn(human, {
				requestId: one.version.requestId,
				page: two.page.ref,
				expectedVersion: two.page.revision,
				document: second,
				sourcePath: "index.html",
			}),
		).rejects.toThrow("A row with this value exists.");
	});
});
