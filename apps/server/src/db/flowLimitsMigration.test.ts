import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { migrate as runMigrations } from "drizzle-orm/pglite/migrator";
import { ulid } from "ulid";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(await readFile(join(migrationsDir, "meta/_journal.json"), "utf8")) as {
	version: string;
	dialect: string;
	entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[];
};
const fixturesDir = await mkdtemp(join(tmpdir(), "trellis-flow-limits-migration-"));

afterAll(async () => {
	await rm(fixturesDir, { recursive: true });
});

test("migration 0131 preserves flow rows and removes their application ceilings", async () => {
	const earlierEntries = journal.entries.filter((entry) => entry.idx < 131);
	await mkdir(join(fixturesDir, "meta"));
	await writeFile(join(fixturesDir, "meta/_journal.json"), JSON.stringify({ ...journal, entries: earlierEntries }));
	for (const entry of earlierEntries)
		await copyFile(join(migrationsDir, `${entry.tag}.sql`), join(fixturesDir, `${entry.tag}.sql`));

	const db = await openDb(":memory:");
	try {
		await runMigrations(db, { migrationsFolder: fixturesDir });
		const flowId = ulid();
		const nodeId = ulid();
		const childId = ulid();
		const edgeId = ulid();
		const at = "2026-09-29T06:00:00.000Z";
		await db.execute(sql`INSERT INTO flows
			(id, slug, name, description, briefing, version, created_at, updated_at)
			VALUES (${flowId}, 'existing-flow', 'Existing flow', 'Description', 'Briefing', 1, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO flow_nodes
			(id, flow_id, parent_id, kind, title, instruction, parallel, minutes, max_rounds,
			harness, review_area, x, y, width, height)
			VALUES
			(${nodeId}, ${flowId}, NULL, 'group', 'Existing group', '', false, 1440, NULL,
			NULL, NULL, 10, 20, 200, 100),
			(${childId}, ${flowId}, ${nodeId}, 'agent', 'Existing child', 'Work.', false, NULL, NULL,
			NULL, NULL, 30, 40, NULL, NULL)`);
		await db.execute(sql`INSERT INTO flow_edges
			(id, flow_id, from_node_id, to_node_id, branch)
			VALUES (${edgeId}, ${flowId}, ${nodeId}, ${childId}, 'out')`);

		expect(await migrate(db)).toBe(journal.entries.length - earlierEntries.length);
		expect(
			(await db.execute(sql`SELECT flow_id, minutes, x, y, width, height FROM flow_nodes WHERE id=${nodeId}`)).rows,
		).toEqual([{ flow_id: flowId, minutes: 1440, x: 10, y: 20, width: 200, height: 100 }]);
		expect((await db.execute(sql`SELECT parent_id FROM flow_nodes WHERE id=${childId}`)).rows).toEqual([
			{ parent_id: nodeId },
		]);
		expect((await db.execute(sql`SELECT from_node_id, to_node_id FROM flow_edges WHERE id=${edgeId}`)).rows).toEqual([
			{ from_node_id: nodeId, to_node_id: childId },
		]);

		const largeFlowId = ulid();
		const largeGroupId = ulid();
		const loopId = ulid();
		const slug = `flow-${"s".repeat(64)}`;
		const name = "n".repeat(121);
		const description = "d".repeat(2001);
		const briefing = "b".repeat(200_001);
		await db.execute(sql`INSERT INTO flows
			(id, slug, name, description, briefing, version, created_at, updated_at)
			VALUES (${largeFlowId}, ${slug}, ${name}, ${description}, ${briefing}, 1, ${at}, ${at})`);
		await db.execute(sql`INSERT INTO flow_nodes
			(id, flow_id, parent_id, kind, title, instruction, parallel, minutes, max_rounds,
			harness, review_area, x, y, width, height)
			VALUES
			(${largeGroupId}, ${largeFlowId}, NULL, 'group', ${"t".repeat(121)}, '', false, 1441, NULL,
			NULL, NULL, 1000001, -1000001, 100001, 100001),
			(${loopId}, ${largeFlowId}, NULL, 'loop', 'Loop', ${"i".repeat(200_001)}, false, NULL, 51,
			NULL, NULL, 0, 0, NULL, NULL)`);

		expect(
			(await db.execute(sql`SELECT slug, name, description, briefing FROM flows WHERE id=${largeFlowId}`)).rows,
		).toEqual([{ slug, name, description, briefing }]);
		expect(
			(await db.execute(sql`SELECT minutes, x, y, width, height FROM flow_nodes WHERE id=${largeGroupId}`)).rows,
		).toEqual([{ minutes: 1441, x: 1_000_001, y: -1_000_001, width: 100_001, height: 100_001 }]);
		expect((await db.execute(sql`SELECT max_rounds, instruction FROM flow_nodes WHERE id=${loopId}`)).rows).toEqual([
			{ max_rounds: 51, instruction: "i".repeat(200_001) },
		]);

		await expect(db.execute(sql`UPDATE flow_nodes SET minutes=0 WHERE id=${largeGroupId}`)).rejects.toThrow(
			"flow_nodes_minutes_check",
		);
		await expect(
			db.execute(sql`UPDATE flow_nodes SET x='Infinity'::double precision WHERE id=${largeGroupId}`),
		).rejects.toThrow("flow_nodes_coordinates_check");
		await expect(
			db.execute(sql`UPDATE flow_nodes SET width='NaN'::double precision WHERE id=${largeGroupId}`),
		).rejects.toThrow("flow_nodes_size_check");
		await expect(db.execute(sql`UPDATE flow_nodes SET minutes=1 WHERE id=${loopId}`)).rejects.toThrow(
			"flow_nodes_minutes_check",
		);
		await expect(db.execute(sql`UPDATE flows SET slug='Bad slug' WHERE id=${largeFlowId}`)).rejects.toThrow(
			"flows_slug_check",
		);
	} finally {
		await db.$client.close();
	}
}, 60_000);
