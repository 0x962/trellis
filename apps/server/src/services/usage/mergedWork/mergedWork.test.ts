import { afterAll, beforeAll, expect, test } from "bun:test";
import { UsageMergedWorkSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../../db/testDb.ts";
import { mergedWork } from "./mergedWork.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const at = new Date("2026-11-03T17:00:00.000Z");
const project = ulid();
const status = ulid();
const tickets = [ulid(), ulid()];
const previousZone = process.env.TZ;
const run = (computedAt = at.toISOString()) => db.transaction((tx) => mergedWork({}, tx, { days: 7, computedAt }));

async function insert(
	number: number,
	mergedAt: Date | null,
	additions: number | null,
	deletions: number | null,
	links = 1,
	state = "merged",
	repo = "app",
) {
	const id = ulid();
	await db.execute(sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, merged_at, additions, deletions, created_at, updated_at)
		VALUES (${id}, 'fixture', ${repo}, ${number}, ${`https://github.com/fixture/${repo}/pull/${number}`}, ${state}, ${mergedAt}, ${additions}, ${deletions}, ${at}, ${at})`);
	for (const ticket of tickets.slice(0, links))
		await db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id, pull_request_id, source, actor_id, actor_name, actor_kind, created_at)
		VALUES (${ticket}, ${id}, 'manual', (SELECT id FROM actors WHERE name = 'usage-test'), 'usage-test', 'human', ${at})`);
}

beforeAll(async () => {
	process.env.TZ = "America/New_York";
	db = await openTestDb();
	await db.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES ('usage-test', 'human', ${at}, ${at})`,
	);
	await db.execute(
		sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at) VALUES (${project}, 'TEST', 'test', 'Test', ${at}, ${at})`,
	);
	await db.execute(
		sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at) VALUES (${status}, ${project}, 'Todo', 'todo', 'todo', 'neutral', 0, true, ${at}, ${at})`,
	);
	for (const [i, ticket] of tickets.entries())
		await db.execute(
			sql`INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at) VALUES (${ticket}, ${project}, ${i + 1}, 'Fixture', ${status}, 0, ${at}, ${at})`,
		);
	await insert(1, new Date("2026-10-28T04:00:00Z"), 100, 40, 2);
	await insert(2, new Date("2026-11-01T05:30:00Z"), 20, 5);
	await insert(3, new Date("2026-11-01T06:30:00Z"), null, 8);
	await insert(4, at, 7, null);
	await insert(1, at, 3, 2, 1, "merged", "other");
	await insert(5, new Date("2026-10-28T03:59:59Z"), 900, 900);
	await insert(6, new Date(at.getTime() + 1), 900, 900);
	await insert(7, at, 900, 900, 0);
	await insert(8, at, 900, 900, 1, "closed");
	await insert(9, null, 900, 900);
}, 30000);

afterAll(async () => {
	await db.$client.close();
	if (previousZone === undefined) delete process.env.TZ;
	else process.env.TZ = previousZone;
});

test("counts a multiply linked PR once and keeps repository identities distinct", async () => {
	const result = await run();
	expect(UsageMergedWorkSchema.parse(result)).toEqual(result);
	expect(result.totals).toEqual({ prs: 5, additions: 130, deletions: 55, missingAdditions: 1, missingDeletions: 1 });
});

test("uses local calendar boundaries across the repeated hour and fills days without merges", async () => {
	const result = await run();
	expect(result.buckets.map((b) => b.day)).toEqual([
		"2026-10-28",
		"2026-10-29",
		"2026-10-30",
		"2026-10-31",
		"2026-11-01",
		"2026-11-02",
		"2026-11-03",
	]);
	expect(result.buckets.map((b) => b.prs)).toEqual([1, 0, 0, 0, 2, 0, 2]);
	expect(result.buckets[4]).toMatchObject({ additions: 20, deletions: 13, missingAdditions: 1 });
});

test("an empty historical range has zero totals and seven dated buckets", async () => {
	const result = await run("2025-01-01T17:00:00Z");
	expect(result.buckets).toHaveLength(7);
	expect(result.buckets.every((b) => b.prs === 0)).toBe(true);
	expect(result.totals).toEqual({ prs: 0, additions: 0, deletions: 0, missingAdditions: 0, missingDeletions: 0 });
});
