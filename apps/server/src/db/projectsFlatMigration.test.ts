import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UlidSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "./client.ts";

// Migration 0107 turns the project tree into a flat list. The fixture holds
// one tree two levels deep whose tickets sit in the deepest project, a
// second tree whose child answers to the same key as the first tree's child,
// and statuses that only the roots own.

const migrationsDir = join(import.meta.dir, "../../drizzle");

const migrationFiles = () =>
	readdirSync(migrationsDir)
		.filter((name) => /^\d{4}.*\.sql$/.test(name))
		.sort();

const index = (name: string) => Number(name.slice(0, 4));

const apply = async (db: Db, names: string[]) => {
	for (const name of names) await db.$client.exec(readFileSync(join(migrationsDir, name), "utf8"));
};

const before = migrationFiles().filter((name) => index(name) < 107);
const only107 = migrationFiles().filter((name) => index(name) === 107);

// WO holds the key and two levels below it: `WO.shop` and `WO.shop.parts`.
// Every ticket of the tree sits in `parts`. AC holds one child that also
// answers to the slug `shop`. Only WO and AC own statuses.
const seed = async (db: Db) => {
	await db.$client.exec(`
		INSERT INTO projects (id, parent_id, root_id, key, slug, name, ticket_counter, position, created_at, updated_at)
		VALUES ('wo', NULL, 'wo', 'WO', 'wo', 'Workbench', 2, 0, now(), now());
		INSERT INTO projects (id, parent_id, root_id, key, slug, name, position, created_at, updated_at)
		VALUES ('shop', 'wo', 'wo', NULL, 'shop', 'Shop', 0, now(), now()),
			('parts', 'shop', 'wo', NULL, 'parts', 'Parts', 0, now(), now());
		INSERT INTO projects (id, parent_id, root_id, key, slug, name, ticket_counter, position, created_at, updated_at)
		VALUES ('ac', NULL, 'ac', 'AC', 'ac', 'Acme', 0, 1, now(), now());
		INSERT INTO projects (id, parent_id, root_id, key, slug, name, position, created_at, updated_at)
		VALUES ('ac-shop', 'ac', 'ac', NULL, 'shop', 'Acme shop', 0, now(), now());
		INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES ('wo-todo', 'wo', 'Todo', 'todo', 'todo', 'fg-muted', 0, true, now(), now()),
			('wo-done', 'wo', 'Done', 'done', 'done', 'success', 1, false, now(), now()),
			('ac-todo', 'ac', 'Todo', 'todo', 'todo', 'fg-muted', 0, true, now(), now());
		INSERT INTO repos (id, project_id, owner, repo) VALUES ('r1', 'wo', 'acme', 'app');
		INSERT INTO epics (id, project_id, root_id, slug, name, actor_name, actor_kind, created_at, updated_at)
		VALUES ('e1', 'wo', 'wo', 'first-run', 'First run', 'trellis', 'system', now(), now());
		INSERT INTO tickets (id, project_id, root_id, number, title, status_id, epic_id, position, created_at, updated_at)
		VALUES ('t1', 'parts', 'wo', 1, 'One', 'wo-todo', 'e1', 0, now(), now()),
			('t2', 'parts', 'wo', 2, 'Two', 'wo-done', NULL, 1, now(), now());
		INSERT INTO label_groups (id, project_id, name, created_at, updated_at)
		VALUES ('g1', 'wo', 'Type', now(), now());
		INSERT INTO labels (id, project_id, group_id, name, color, created_at, updated_at)
		VALUES ('l1', 'wo', 'g1', 'bug', 'red', now(), now());
	`);
};

const migrated = async () => {
	const db = await openDb(":memory:");
	await apply(db, before);
	await seed(db);
	await apply(db, only107);
	return db;
};

test("migration 0107 moves the key to the project that holds the tickets", async () => {
	const db = await migrated();
	try {
		const projects = await db.execute(
			sql`SELECT id, key, slug, ticket_counter, position FROM projects ORDER BY position, id`,
		);
		expect(projects.rows).toEqual([
			{ id: "wo", key: "WO2", slug: "wo", ticket_counter: 0, position: 0 },
			{ id: "shop", key: "SHOP2", slug: "shop", ticket_counter: 0, position: 1 },
			{ id: "parts", key: "WO", slug: "parts", ticket_counter: 2, position: 2 },
			{ id: "ac", key: "AC", slug: "ac", ticket_counter: 0, position: 3 },
			{ id: "ac-shop", key: "SHOP", slug: "shop-2", ticket_counter: 0, position: 4 },
		]);
	} finally {
		await db.$client.close();
	}
}, 120_000);

test("migration 0107 keeps every ticket identifier and moves the epic with the key", async () => {
	const db = await migrated();
	try {
		const tickets = await db.execute(sql`
			SELECT p.key || '-' || t.number AS identifier, t.project_id, t.epic_id
			FROM tickets t JOIN projects p ON p.id = t.project_id ORDER BY t.number`);
		expect(tickets.rows).toEqual([
			{ identifier: "WO-1", project_id: "parts", epic_id: "e1" },
			{ identifier: "WO-2", project_id: "parts", epic_id: null },
		]);
		const epics = await db.execute(
			sql`SELECT p.key || '/' || e.slug AS ref FROM epics e JOIN projects p ON p.id = e.project_id`,
		);
		expect(epics.rows).toEqual([{ ref: "WO/first-run" }]);
		const labels = await db.execute(sql`
			SELECT (SELECT project_id FROM labels WHERE id = 'l1') AS label,
				(SELECT project_id FROM label_groups WHERE id = 'g1') AS grp`);
		expect(labels.rows).toEqual([{ label: "parts", grp: "parts" }]);
	} finally {
		await db.$client.close();
	}
}, 120_000);

test("migration 0107 copies the inherited statuses and the inherited repositories", async () => {
	const db = await migrated();
	try {
		const statuses = await db.execute(sql`
			SELECT project_id, count(*)::int AS n FROM statuses GROUP BY project_id ORDER BY project_id`);
		expect(statuses.rows).toEqual([
			{ project_id: "ac", n: 1 },
			{ project_id: "ac-shop", n: 1 },
			{ project_id: "parts", n: 2 },
			{ project_id: "shop", n: 2 },
			{ project_id: "wo", n: 2 },
		]);
		const onTicket = await db.execute(sql`
			SELECT t.id, s.project_id, s.slug FROM tickets t JOIN statuses s ON s.id = t.status_id ORDER BY t.number`);
		expect(onTicket.rows).toEqual([
			{ id: "t1", project_id: "parts", slug: "todo" },
			{ id: "t2", project_id: "parts", slug: "done" },
		]);
		const repos = await db.execute(sql`SELECT project_id, owner, repo FROM repos ORDER BY project_id`);
		expect(repos.rows).toEqual([
			{ project_id: "parts", owner: "acme", repo: "app" },
			{ project_id: "shop", owner: "acme", repo: "app" },
			{ project_id: "wo", owner: "acme", repo: "app" },
		]);
		// Every id the migration writes is a ULID, because the wire schema of a
		// status and of a repository refuses every other id.
		const copied = await db.execute(sql`
			SELECT id FROM statuses WHERE project_id <> 'wo' AND project_id <> 'ac'
			UNION ALL SELECT id FROM repos WHERE project_id <> 'wo'`);
		for (const row of copied.rows) expect(UlidSchema.safeParse(row.id).success).toBe(true);
		expect(copied.rows.length).toBe(7);
	} finally {
		await db.$client.close();
	}
}, 120_000);

test("migration 0107 stops when two projects of one tree hold tickets", async () => {
	const db = await openDb(":memory:");
	try {
		await apply(db, before);
		await seed(db);
		await db.$client.exec(`
			INSERT INTO tickets (id, project_id, root_id, number, title, status_id, position, created_at, updated_at)
			VALUES ('t3', 'shop', 'wo', 3, 'Three', 'wo-todo', 2, now(), now());
		`);
		await expect(apply(db, only107)).rejects.toThrow("Two projects of one tree hold tickets");
	} finally {
		await db.$client.close();
	}
}, 120_000);
