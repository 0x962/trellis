import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActorSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { createContext, type ServiceCtx } from "../../context.ts";
import * as actors from "../../services/actors.ts";
import { type Db, openDb } from "../client.ts";
import { migrate } from "../migrate.ts";

let db: Db;
let directory: string;
afterAll(async () => {
	await db.$client.close();
	await rm(directory, { recursive: true });
});

test("the actor migration preserves rows and accepts distinct complete names through the header and service", async () => {
	const migrations = join(import.meta.dir, "../../../drizzle");
	const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8")) as {
		entries: { idx: number; tag: string }[];
	};
	const boundary = journal.entries.findIndex((entry) => entry.tag.endsWith("_preserve_actor_names"));
	expect(boundary).toBeGreaterThan(0);
	const entries = journal.entries.slice(0, boundary);
	directory = await mkdtemp(join(tmpdir(), "trellis-actor-migration-"));
	await mkdir(join(directory, "meta"));
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries) {
		await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
	}
	db = await openDb(":memory:");
	await runMigrations(db, { migrationsFolder: directory });
	const ctx = { now: new Date(), actorCache: new Map<string, number>() } as ServiceCtx;
	await db.transaction((tx) => actors.upsert(ctx, tx, { kind: "human", name: "retained" }));
	const before = (await db.execute(sql`SELECT * FROM actors ORDER BY name, kind`)).rows;
	const names = [`${"a".repeat(64)}-first`, `${"a".repeat(64)}-second`];
	await expect(db.transaction((tx) => actors.upsert(ctx, tx, { kind: "human", name: names[0]! }))).rejects.toThrow();
	expect(await migrate(db)).toBeGreaterThan(0);
	expect((await db.execute(sql`SELECT * FROM actors ORDER BY name, kind`)).rows).toEqual(before);
	for (const name of names) {
		const request = createContext({ headers: new Headers({ "x-trellis-actor": `human:${name}` }), reqId: name });
		expect(request.actor).toEqual({ kind: "human", name });
		await db.transaction((tx) => actors.upsert(ctx, tx, request.actor!));
	}
	const actual = await db.transaction((tx) => actors.list(ctx, tx));
	for (const name of names) {
		expect(ActorSchema.parse(actual.find((actor) => actor.name === name)).name).toBe(name);
	}
	for (const name of ["", "a:b", "a\n", "a\r", "a\t", "a\x7f", "José"]) {
		await expect(db.transaction((tx) => actors.upsert(ctx, tx, { kind: "human", name }))).rejects.toThrow();
	}
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await migrate(db)).toBe(0);
	const reopened = await db.transaction((tx) => actors.list(ctx, tx));
	expect(reopened).toEqual(actual);
}, 60_000);
