import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import { openDb } from "./client.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
	version: string;
	dialect: string;
	entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[];
};
const fixturesDir = await mkdtemp(join(tmpdir(), "trellis-session-updates-migration-"));

afterAll(async () => {
	await rm(fixturesDir, { recursive: true });
});

test("migration 0130 preserves saved updates and keys requests by run", async () => {
	const earlierEntries = journal.entries.filter((entry) => entry.idx < 130);
	await mkdir(join(fixturesDir, "meta"));
	await writeFile(join(fixturesDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlierEntries }));
	for (const entry of earlierEntries)
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(fixturesDir, `${entry.tag}.sql`));

	const db = await openDb(":memory:");
	try {
		await runMigrations(db, { migrationsFolder: fixturesDir });
		const runId = ulid();
		const sessionId = ulid();
		const updateId = ulid();
		const requestId = crypto.randomUUID();
		const at = "2026-09-29T05:00:00.000Z";
		await db.execute(sql`INSERT INTO agent_runs
			(id, name, kind, instruction, project_key, created_at, updated_at)
			VALUES (${runId}, 'Saved session', 'session', 'Work.', '', ${at}, ${at})`);
		await db.execute(sql`INSERT INTO sessions
			(id, name, directory, harness, run_id, created_at, updated_at)
			VALUES (${sessionId}, 'Saved session', '/tmp/saved-session', '{"preset":"codex"}'::jsonb,
			${runId}, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO session_update_requests
			(request_id, session_id, requested_at, state, error)
			VALUES (${requestId}, ${sessionId}, ${at}, 'answered', NULL)`);
		await db.execute(sql`INSERT INTO session_updates
			(id, session_id, run_id, request_id, body, embeds, created_at)
			VALUES (${updateId}, ${sessionId}, ${runId}, ${requestId}, 'Saved before migration.', '[]'::jsonb, ${at})`);

		const through0130 = journal.entries.filter((entry) => entry.idx <= 130);
		await writeFile(join(fixturesDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: through0130 }));
		await copyFile(join(migrationsDir, "0130_sloppy_naoko.sql"), join(fixturesDir, "0130_sloppy_naoko.sql"));
		await runMigrations(db, { migrationsFolder: fixturesDir });

		expect(
			(
				await db.execute(sql`SELECT request_id, run_id, session_id, state
					FROM session_update_requests WHERE request_id=${requestId}`)
			).rows,
		).toEqual([{ request_id: requestId, run_id: runId, session_id: sessionId, state: "answered" }]);
		expect(
			(
				await db.execute(sql`SELECT id, run_id, session_id, body
					FROM session_updates WHERE id=${updateId}`)
			).rows,
		).toEqual([{ id: updateId, run_id: runId, session_id: sessionId, body: "Saved before migration." }]);

		await db.execute(sql`DELETE FROM sessions WHERE id=${sessionId}`);
		expect(
			(await db.execute(sql`SELECT session_id FROM session_update_requests WHERE request_id=${requestId}`)).rows,
		).toEqual([{ session_id: null }]);
		expect((await db.execute(sql`SELECT session_id FROM session_updates WHERE id=${updateId}`)).rows).toEqual([
			{ session_id: null },
		]);
	} finally {
		await db.$client.close();
	}
}, 60_000);
