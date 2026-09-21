import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { type Db, openDb } from "./client.ts";

// Migration 0093 copies each answer that a question ticket holds as a comment
// into `ticket_answers`, and points each queued answer delivery at the copy.

const migrationsDir = join(import.meta.dir, "../../drizzle");

const migrationFiles = () =>
	readdirSync(migrationsDir)
		.filter((name) => /^\d{4}.*\.sql$/.test(name))
		.sort();

const apply = async (db: Db, names: string[]) => {
	for (const name of names) await db.$client.exec(readFileSync(join(migrationsDir, name), "utf8"));
};

const index = (name: string) => Number(name.slice(0, 4));

test("migration 0093 keeps every answered question answered", async () => {
	const files = migrationFiles();
	const db = await openDb(":memory:");
	try {
		await apply(
			db,
			files.filter((name) => index(name) < 93),
		);
		// q1 holds a person's answer. q2 holds an agent's answer that a queued
		// delivery points at. t3 asks no question, so its "Answer:" comment is
		// prose. c4 is a plain comment on q1.
		await db.$client.exec(`
			INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
			VALUES ('p1', 'p1', 'OP', 'op', 'Operator', now(), now());
			INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
			VALUES ('done', 'p1', 'Done', 'done', 'done', 'success', 0, true, now(), now());
			INSERT INTO tickets (id, project_id, root_id, number, title, description, status_id, position, created_at, updated_at)
			VALUES
				('q1', 'p1', 'p1', 1, 'Run late', E'Which?\n\nOptions:\n1. Leave it.\n2. Run late.', 'done', 0, now(), now()),
				('q2', 'p1', 'p1', 2, 'One queue', E'Options:\n1. One.\n2. Many.', 'done', 1, now(), now()),
				('t3', 'p1', 'p1', 3, 'Build it', 'Build the sweep.', 'done', 2, now(), now());
			INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
			VALUES ('dana', 'human', now(), now()), ('run1', 'agent', now(), now());
			INSERT INTO comments (id, ticket_id, body, actor_name, actor_kind, created_at, updated_at) VALUES
				('c1', 'q1', 'Answer: option 2. A late run reads its own day.', 'dana', 'human', '2026-09-20T10:00:00Z', now()),
				('c2', 'q2', 'Answer: option 1. One queue is enough.', 'run1', 'agent', '2026-09-20T11:00:00Z', now()),
				('c3', 't3', 'Answer: option 1. Not a question.', 'dana', 'human', now(), now()),
				('c4', 'q1', 'Looks right.', 'dana', 'human', now(), now());
			INSERT INTO agent_runs (id, name, kind, instruction, project_path, ticket_id, terminal_id, created_at, updated_at)
			VALUES ('run1', 'crisp-fjord', 'agent', 'Build it', '/tmp/work', 't3', 'term-1', now(), now());
			INSERT INTO review_deliveries (id, answer_comment_id, run_id) VALUES ('d1', 'c2', 'run1');
		`);
		await apply(
			db,
			files.filter((name) => index(name) === 93),
		);

		const answers = await db.execute(
			sql`SELECT id, ticket_id, option, reason, actor_name, actor_kind FROM ticket_answers ORDER BY id`,
		);
		expect(answers.rows).toEqual([
			{
				id: "c1",
				ticket_id: "q1",
				option: 2,
				reason: "A late run reads its own day.",
				actor_name: "dana",
				actor_kind: "human",
			},
			{
				id: "c2",
				ticket_id: "q2",
				option: 1,
				reason: "One queue is enough.",
				actor_name: "run1",
				actor_kind: "agent",
			},
		]);
		const deliveries = await db.execute(sql`SELECT id, answer_id, run_id FROM review_deliveries`);
		expect(deliveries.rows).toEqual([{ id: "d1", answer_id: "c2", run_id: "run1" }]);
		const comments = await db.execute(sql`SELECT count(*)::int AS n FROM comments`);
		expect(comments.rows).toEqual([{ n: 4 }]);
	} finally {
		await db.$client.close();
	}
}, 60_000);
