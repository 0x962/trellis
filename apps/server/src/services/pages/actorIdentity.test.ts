import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActorRef } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { textArray } from "../../db/queries/support.ts";
import { openTestDb, openTestDbFromArchive } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx, PrepareCtx } from "../support.ts";
import { versions } from "./content.ts";
import { get, list, pin } from "./pages.ts";
import { preparePublish, publish } from "./publish.ts";
import { prepareUpload, upload } from "./uploads.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let home: string;
const cache = createCache();
const at = new Date("2026-09-29T21:00:00.000Z");
const project = { id: ulid(), key: "ACT", slug: "actor-pages" };

const nameOf = (size: number, seed: number) => {
	let state = seed;
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,-./;<=>?@[]^_`{|}~";
	return Array.from({ length: size }, () => {
		state = (state * 48_271) % 2_147_483_647;
		return alphabet[state % alphabet.length]!;
	}).join("");
};

const sharedPrefix = nameOf(4096, 17);
const firstActor = { kind: "human", name: sharedPrefix } as const satisfies ActorRef;
const secondActor = {
	kind: "human",
	name: `${sharedPrefix}${nameOf(12_288, 29)}`,
} as const satisfies ActorRef;

const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const queryRows = async <T>(query: SQL) => (await db.execute(query)).rows as T[];

const contextOf = (actor: ActorRef): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now: at,
	emit: () => {},
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
		now: () => at,
		log: () => {},
		newTx: inTx,
		afterCommit: () => {},
	}) as unknown as IoCtx & PrepareCtx;

const stage = async (actor: ActorRef, file: File) => {
	const ctx = ioContextOf(actor);
	const prepared = await prepareUpload(ctx, { project: project.key, file });
	return inTx((tx) => upload(ctx, tx, prepared));
};

const publishIn = async (actor: ActorRef, input: Record<string, unknown>) => {
	const ctx = ioContextOf(actor);
	const prepared = await preparePublish(ctx, input);
	return inTx((tx) => publish(ctx, tx, prepared));
};

const actorCount = async () =>
	(await queryRows<{ count: number }>(sql`SELECT count(*)::int AS count FROM actors`))[0]!.count;

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-page-actor-"));
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${project.id}, ${project.key}, ${project.slug}, 'Actor Pages', ${at}, ${at})`);
	await inTx(cache.rebuild);
}, 30_000);

afterAll(async () => {
	await db.$client.close();
	await rm(home, { recursive: true, force: true });
});

test("keeps Page ownership exact for complete actor names", async () => {
	const firstDocument = await stage(
		firstActor,
		new File(["<main>First version</main>"], "index.html", { type: "text/html" }),
	);
	const heldUpload = await stage(firstActor, new File(["private"], "private.html", { type: "text/html" }));
	const created = await publishIn(firstActor, {
		requestId: crypto.randomUUID(),
		project: project.key,
		title: "Complete actor names",
		document: firstDocument.id,
		sourcePath: "index.html",
	});
	const otherDocument = await stage(
		firstActor,
		new File(["<main>Other page</main>"], "other.html", { type: "text/html" }),
	);
	const other = await publishIn(firstActor, {
		requestId: crypto.randomUUID(),
		project: project.key,
		title: "Other Page",
		document: otherDocument.id,
		sourcePath: "other.html",
	});

	const countBeforeRead = await actorCount();
	expect((await inTx((tx) => get(contextOf(secondActor), tx, { page: created.page.id }))).pinned).toBe(false);
	expect(await actorCount()).toBe(countBeforeRead);

	const firstContext = contextOf(firstActor);
	await inTx((tx) => pin(firstContext, tx, { page: created.page.id, pinned: true }));
	await inTx((tx) => pin(firstContext, tx, { page: created.page.id, pinned: true }));
	expect((await db.execute(sql`SELECT count(*)::int AS count FROM page_pins`)).rows).toEqual([{ count: 1 }]);
	const firstPage = await inTx((tx) => list(firstContext, tx, { project: project.key, limit: 1 }));
	expect(firstPage.items.map((page) => page.id)).toEqual([created.page.id]);
	expect(firstPage.nextCursor).not.toBeNull();
	expect(
		(
			await inTx((tx) => list(firstContext, tx, { project: project.key, limit: 1, cursor: firstPage.nextCursor! }))
		).items.map((page) => page.id),
	).toEqual([other.page.id]);
	await expect(
		inTx((tx) => list(firstContext, tx, { project: project.key, pinned: true, cursor: firstPage.nextCursor! })),
	).rejects.toMatchObject({ code: "INVALID_CURSOR" });
	expect((await inTx((tx) => list(firstContext, tx, { project: project.key, pinned: true }))).items).toHaveLength(1);
	expect((await inTx((tx) => get(firstContext, tx, { page: created.page.id }))).pinned).toBe(true);
	expect((await inTx((tx) => get(contextOf(secondActor), tx, { page: created.page.id }))).pinned).toBe(false);

	await expect(
		publishIn(secondActor, {
			requestId: crypto.randomUUID(),
			project: project.key,
			title: "Foreign upload",
			document: heldUpload.id,
			sourcePath: "index.html",
		}),
	).rejects.toMatchObject({ code: "NOT_FOUND" });

	const secondDocument = await stage(
		secondActor,
		new File(["<main>Second version</main>"], "index.html", { type: "text/html" }),
	);
	const changed = await publishIn(secondActor, {
		requestId: crypto.randomUUID(),
		page: created.page.id,
		expectedVersion: 1,
		document: secondDocument.id,
		sourcePath: "index.html",
	});
	expect(changed.page.publishedBy).toEqual(secondActor);
	expect(
		(await inTx((tx) => versions(contextOf(secondActor), tx, { page: created.page.id }))).items.map(
			(version) => version.actor,
		),
	).toEqual([secondActor, firstActor]);
	expect(
		(
			await inTx((tx) =>
				list(contextOf(secondActor), tx, { project: project.key, author: `human:${secondActor.name}` }),
			)
		).items,
	).toHaveLength(1);
	expect(
		(
			await inTx((tx) => list(firstContext, tx, { project: project.key, author: `human:${firstActor.name}` }))
		).items.map((page) => page.id),
	).toEqual([other.page.id]);

	await inTx((tx) => pin(firstContext, tx, { page: created.page.id, pinned: false }));
	await inTx((tx) => pin(contextOf(secondActor), tx, { page: created.page.id, pinned: true }));
	expect((await inTx((tx) => get(firstContext, tx, { page: created.page.id }))).pinned).toBe(false);
	expect((await inTx((tx) => get(contextOf(secondActor), tx, { page: created.page.id }))).pinned).toBe(true);

	const names = [
		"page_pins_pkey",
		"page_pins_actor_idx",
		"page_uploads_project_actor_idx",
		"page_versions_actor_created_at_idx",
	];
	const indexes = await queryRows<{ indexname: string; indexdef: string }>(
		sql`SELECT indexname, indexdef FROM pg_indexes WHERE indexname = ANY(${textArray(names)}) ORDER BY indexname`,
	);
	expect(indexes.map((index) => index.indexname)).toEqual([...names].sort());
	for (const index of indexes) {
		expect(index.indexdef).toContain("actor_id");
		expect(index.indexdef).not.toContain("actor_name");
		expect(index.indexdef).not.toContain("actor_kind");
	}

	const archive = await db.$client.dumpDataDir("none");
	await db.$client.close();
	db = await openTestDbFromArchive(archive);
	await inTx(cache.rebuild);
	expect((await inTx((tx) => get(contextOf(secondActor), tx, { page: created.page.id }))).pinned).toBe(true);
	expect(
		(await inTx((tx) => versions(contextOf(secondActor), tx, { page: created.page.id }))).items.map(
			(version) => version.actor,
		),
	).toEqual([secondActor, firstActor]);

	await db.execute(sql`DELETE FROM pages WHERE id = ${created.page.id}`);
	expect((await db.execute(sql`SELECT count(*)::int AS count FROM page_pins`)).rows).toEqual([{ count: 0 }]);
	expect(
		(await db.execute(sql`SELECT count(*)::int AS count FROM page_versions WHERE page_id = ${created.page.id}`)).rows,
	).toEqual([{ count: 0 }]);
}, 60_000);
