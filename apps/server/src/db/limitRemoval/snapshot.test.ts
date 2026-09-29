import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const directory = new URL("../../../drizzle/", import.meta.url);
const load = async (path: string) => JSON.parse(await readFile(new URL(path, directory), "utf8"));

test("0138 extends the frozen receipt snapshot without column or foreign key changes", async () => {
	const bytes = await readFile(new URL("meta/0137_snapshot.json", directory));
	expect(createHash("sha256").update(bytes).digest("hex")).toBe(
		"2af28455501af4490146e65dc16ec87b9687bd7d172277a8c8585faa4fae4de6",
	);
	const previous = JSON.parse(bytes.toString("utf8"));
	const current = await load("meta/0138_snapshot.json");
	expect(current.prevId).toBe(previous.id);
	const journal = await load("meta/_journal.json");
	const priorEntry = journal.entries.find((entry: { idx: number }) => entry.idx === 137);
	const newEntry = journal.entries.find((entry: { idx: number }) => entry.idx === 138);
	expect(priorEntry.tag).toBe("0137_glorious_norman_osborn");
	expect(newEntry.tag).toBe("0138_complete_text_limits");
	expect(newEntry.when).toBeGreaterThan(priorEntry.when);
	expect(Object.keys(current.tables)).toEqual(Object.keys(previous.tables));
	for (const name of Object.keys(previous.tables)) {
		const before = previous.tables[name];
		const after = current.tables[name];
		for (const field of Object.keys(before)) {
			if (!["checkConstraints", "indexes", "uniqueConstraints", "compositePrimaryKeys"].includes(field)) {
				expect(after[field], `${name}.${field}`).toEqual(before[field]);
			}
		}
	}
	const sql = await readFile(new URL("0138_complete_text_limits.sql", directory), "utf8");
	expect(sql.match(/EXCLUDE USING hash/g)).toHaveLength(11);
	expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|DROP.*FOREIGN KEY|UPDATE |DELETE FROM/);
});
