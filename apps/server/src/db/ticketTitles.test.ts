import { afterAll, beforeAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TicketSchema, TicketSummarySchema, TicketTitleSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { create } from "../services/tickets/create.ts";
import { get, list } from "../services/tickets/read.ts";
import { update } from "../services/tickets/update.ts";
import { createCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import { type Tx, withTx } from "./tx.ts";

let db: Db;
let ctx: ServiceCtx;
const projectId = ulid();
const statusId = ulid();
const originalId = ulid();
const originalTitle = "Existing title 漢字";
const title = "漢字 café 𠮷 ".repeat(120).trim();
const at = "2026-09-29T20:00:00.000Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => withTx(db, fn).then(({ result }) => result);

beforeAll(async () => {
	const migrationsDir = join(import.meta.dir, "../../drizzle");
	const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8"));
	const entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 138);
	const directory = await mkdtemp(join(tmpdir(), "trellis-ticket-title-"));
	await mkdir(join(directory, "meta"));
	await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
	for (const entry of entries)
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
	db = await openDb(":memory:");
	try {
		await runMigrations(db, { migrationsFolder: directory });
	} finally {
		await rm(directory, { recursive: true });
	}
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, ticket_counter, created_at, updated_at)
		VALUES (${projectId}, 'TTL', 'ttl', 'Titles', 1, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${originalId}, ${projectId}, 1, ${originalTitle}, ${statusId}, 0, ${at}, ${at})`);
	ctx = {
		actor: { kind: "human", name: "Test" },
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
	await run((tx) => ctx.cache.rebuild(tx));
}, 60_000);

afterAll(async () => db.$client.close());

test("the forward migration preserves rows and complete multibyte titles across create, edit, and read", async () => {
	const before = (await db.execute(sql`SELECT * FROM tickets WHERE id = ${originalId}`)).rows;
	await expect(db.execute(sql`UPDATE tickets SET title = ${title} WHERE id = ${originalId}`)).rejects.toThrow(
		"tickets_title_check",
	);
	expect(await migrate(db)).toBeGreaterThanOrEqual(1);
	expect((await db.execute(sql`SELECT * FROM tickets WHERE id = ${originalId}`)).rows).toEqual(before);
	const created = await run((tx) => create(ctx, tx, { project: "TTL", title }));
	expect(TicketSchema.parse(created).title).toBe(title);
	const editedTitle = `${title} amended 終`;
	const edited = await run((tx) => update(ctx, tx, { ticket: created.id, title: editedTitle, expectedVersion: 1 }));
	expect(TicketSchema.parse(edited).title).toBe(editedTitle);
	expect((await run((tx) => get(ctx, tx, { ticket: created.id }))).title).toBe(editedTitle);
	const page = await run((tx) => list(ctx, tx, { project: "TTL" }));
	expect(TicketSummarySchema.parse(page.items.find((item) => item.id === created.id)).title).toBe(editedTitle);
	expect(TicketTitleSchema.parse(`  ${title}  `)).toBe(title);
	for (const invalid of ["", "   "]) {
		expect(TicketTitleSchema.safeParse(invalid).success).toBe(false);
		await expect(db.execute(sql`UPDATE tickets SET title = ${invalid} WHERE id = ${originalId}`)).rejects.toThrow(
			"tickets_title_check",
		);
	}
	await db.execute(sql`UPDATE projects SET archived_at = ${at} WHERE id = ${projectId}`);
	await run((tx) => ctx.cache.rebuild(tx));
	await expect(run((tx) => create(ctx, tx, { project: "TTL", title }))).rejects.toMatchObject({
		code: "PROJECT_ARCHIVED",
	});
	await expect(run((tx) => update(ctx, tx, { ticket: created.id, title }))).rejects.toMatchObject({
		code: "PROJECT_ARCHIVED",
	});
	expect((await run((tx) => get(ctx, tx, { ticket: created.id }))).title).toBe(editedTitle);
}, 60_000);
