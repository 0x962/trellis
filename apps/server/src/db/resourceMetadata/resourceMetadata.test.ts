import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResourceSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import { add, get, list, readBlob, update } from "../../services/resources/resources";
import type { IoCtx } from "../../services/support";
import { tempDir } from "../../storage/blobs";
import { createCache } from "../cache";
import { type Db, openDb } from "../client";
import { migrate } from "../migrate";

let db: Db;
let ctx: IoCtx;
let home: string;
const epic = ulid();
const project = ulid();
const actor = { name: "metadata-test", kind: "human" as const };
const now = new Date("2026-09-29T20:00:00.000Z");
const name = `資料-${randomBytes(500).toString("hex")}`;
const url = `https://example.com/?q=${randomBytes(6000).toString("hex")}#end`;
let original: ReturnType<typeof ResourceSchema.parse>;
let originalLink: ReturnType<typeof ResourceSchema.parse>;

beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-resource-metadata-"));
	await mkdir(tempDir(home), { recursive: true });
	const migrations = join(import.meta.dir, "../../../drizzle");
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const boundary = journal.entries.findIndex((entry) => entry.idx === 138);
	expect(boundary).toBeGreaterThan(0);
	const entries = journal.entries.slice(0, boundary);
	const predecessor = join(home, "migrations");
	await mkdir(join(predecessor, "meta"), { recursive: true });
	await writeFile(join(predecessor, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries) {
		await copyFile(join(migrations, `${entry.tag}.sql`), join(predecessor, `${entry.tag}.sql`));
	}
	db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: predecessor });
	await db.execute(sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
		VALUES (${actor.name}, ${actor.kind}, ${now}, ${now})`);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${project}, 'META', 'meta', 'Metadata', ${now}, ${now})`);
	await db.execute(sql`INSERT INTO epics (id, project_id, slug, name, actor_name, actor_kind, created_at, updated_at)
		VALUES (${epic}, ${project}, 'resources', 'Resources', ${actor.name}, ${actor.kind}, ${now}, ${now})`);
	original = {
		id: ulid(),
		epicId: epic,
		kind: "doc",
		name: "Plan",
		body: "Retained body",
		url: null,
		blob: null,
		ticketId: null,
		pullRequestNumber: null,
		actor,
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
	};
	originalLink = {
		...original,
		id: ulid(),
		kind: "link",
		name: "Link",
		body: null,
		url: "https://example.com/retained",
	};
	for (const resource of [original, originalLink]) {
		await db.execute(sql`INSERT INTO epic_resources (
			id, epic_id, kind, name, body, url, actor_name, actor_kind, created_at, updated_at
		) VALUES (
			${resource.id}, ${epic}, ${resource.kind}, ${resource.name}, ${resource.body}, ${resource.url},
			${actor.name}, ${actor.kind}, ${now}, ${now}
		)`);
	}
	await expect(db.execute(sql`UPDATE epic_resources SET name = ${name} WHERE id = ${original.id}`)).rejects.toThrow(
		"epic_resources_name_check",
	);
	await expect(db.execute(sql`UPDATE epic_resources SET url = ${url} WHERE id = ${originalLink.id}`)).rejects.toThrow(
		"epic_resources_url_check",
	);
	expect(await migrate(db)).toBeGreaterThan(0);
	const cache = createCache();
	await db.transaction(cache.rebuild);
	ctx = {
		actor,
		session: null,
		home,
		version: "test",
		apiVersion: "1",
		bootId: ulid(),
		now: () => now,
		ghStatus: () => ({ ok: true }),
		addresses: async () => [],
		log: () => {},
		emit: () => {},
		afterCommit: () => {},
		newTx: (fn) => db.transaction(fn),
		vacuum: async () => {},
		core: {
			actor,
			session: null,
			reqId: ulid(),
			now,
			cache,
			actorCache: new Map(),
			emit: () => {},
			dropBlobs: () => {},
			publicUrl: "http://127.0.0.1:4521",
		},
		localUrl: "http://127.0.0.1:4521",
		publicUrl: "http://127.0.0.1:4521",
		background: () => {},
	};
}, 60_000);

afterAll(async () => {
	await db.$client.close();
	await rm(home, { recursive: true, force: true });
});

test("preserves existing records and complete document names after the registered upgrade", async () => {
	expect(await db.transaction((tx) => get(ctx, tx, { id: original.id }))).toEqual(original);
	expect(await db.transaction((tx) => get(ctx, tx, { id: originalLink.id }))).toEqual(originalLink);
	const created = await db.transaction((tx) => add(ctx, tx, { epic, kind: "doc", name, body: "Original body" }));
	expect(ResourceSchema.parse(created).name).toBe(name);
	const renamed = `${name}-edited`;
	const saved = await db.transaction((tx) => update(ctx, tx, { id: created.id, name: renamed }));
	expect(saved).toMatchObject({ name: renamed, body: "Original body", epicId: epic, actor });
	expect(await db.transaction((tx) => get(ctx, tx, { id: created.id }))).toEqual(saved);
});

test("preserves complete link and blob names through create and read", async () => {
	const link = await db.transaction((tx) => add(ctx, tx, { epic, kind: "link", name, url }));
	expect(ResourceSchema.parse(link)).toMatchObject({ name, url, epicId: epic, actor });
	expect(await db.transaction((tx) => get(ctx, tx, { id: link.id }))).toEqual(link);
	expect(await db.transaction((tx) => list(ctx, tx, { epic }))).toContainEqual(link);
	for (const kind of ["image", "file"] as const) {
		const filename = `${name}.${kind === "image" ? "png" : "txt"}`;
		const file = new File(["contents"], filename, { type: kind === "image" ? "image/png" : "text/plain" });
		const resource = await db.transaction((tx) => add(ctx, tx, { epic, kind, name: filename, file }));
		expect(ResourceSchema.parse(resource).name).toBe(filename);
		expect(await db.transaction((tx) => get(ctx, tx, { id: resource.id }))).toEqual(resource);
		expect(await db.transaction((tx) => readBlob(ctx, tx, { id: resource.id }))).toMatchObject({ name: filename });
	}
});

test("retains name and URL constraints after the registered upgrade", async () => {
	const link = await db.transaction((tx) => add(ctx, tx, { epic, kind: "link", name, url }));
	for (const invalidName of ["", " padded "]) {
		await expect(
			db.execute(sql`UPDATE epic_resources SET name = ${invalidName} WHERE id = ${link.id}`),
		).rejects.toThrow("epic_resources_name_check");
	}
	await expect(db.execute(sql`UPDATE epic_resources SET url = '' WHERE id = ${link.id}`)).rejects.toThrow(
		"epic_resources_url_check",
	);
	await expect(db.transaction((tx) => update(ctx, tx, { id: link.id, name: "Another" }))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});
