import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const directory = new URL("../../../drizzle/", import.meta.url);
const load = async (path: string) => JSON.parse(await readFile(new URL(path, directory), "utf8"));

test("0139 extends frozen 0138 with actor UUIDs and exact identity constraints", async () => {
	const bytes = await readFile(new URL("meta/0138_snapshot.json", directory));
	expect(createHash("sha256").update(bytes).digest("hex")).toBe(
		"77be7f183af6d3b3b573fba6b85158ca7b3e475f0fdcf105965820768a365dae",
	);
	const prior = JSON.parse(bytes.toString("utf8"));
	const current = await load("meta/0139_snapshot.json");
	expect(current.prevId).toBe(prior.id);
	expect(Object.keys(current.tables)).toEqual(Object.keys(prior.tables));
	for (const [table, value] of Object.entries(prior.tables)) {
		const before = value as { columns: Record<string, unknown> };
		for (const [column, definition] of Object.entries(before.columns))
			expect(current.tables[table].columns[column], `${table}.${column}`).toEqual(definition);
	}
	const journal = await load("meta/_journal.json");
	const oldEntry = journal.entries.find((entry: { idx: number }) => entry.idx === 138);
	const newEntry = journal.entries.find((entry: { idx: number }) => entry.idx === 139);
	expect(newEntry.tag).toBe("0139_actor_identity");
	expect(newEntry.when).toBeGreaterThan(oldEntry.when);
	const sql = await readFile(new URL("0139_actor_identity.sql", directory), "utf8");
	expect(sql.match(/EXCLUDE USING hash/g)).toHaveLength(7);
	expect(sql.match(/EXECUTE FUNCTION "enforce_actor_binding"/g)).toHaveLength(22);
	expect(sql.match(/REFERENCES "public"\."actors"\("id"\) ON DELETE no action ON UPDATE no action/g)).toHaveLength(22);
	expect(sql).toContain('CREATE TRIGGER "actors_identity_immutable"');
	expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM/);
	expect(sql.indexOf('UPDATE "page_pins"')).toBeLessThan(sql.indexOf('DROP CONSTRAINT "page_pins_pkey"'));
});
