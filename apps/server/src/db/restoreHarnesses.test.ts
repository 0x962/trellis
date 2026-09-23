import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { restoreHarnesses } from "../services/agentRuns/restoreHarnesses.ts";
import type { Db } from "./client.ts";
import { openTestDb } from "./testDb.ts";

let db: Db;
let home: string;
const harness = HarnessSchema.parse({ preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" });
beforeAll(async () => {
	home = await mkdtemp(join(tmpdir(), "trellis-restore-harness-"));
	db = await openTestDb();
	for (const id of ["known", "unknown", "existing", "missing", "custom"]) {
		await db.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,kind,instruction,project_key,terminal_id,harness,created_at,updated_at) VALUES (${id},${id},'native','agent','','TST',${id},${id === "existing" ? JSON.stringify(harness) : null}::jsonb,now(),now())`,
		);
		if (id === "missing") continue;
		await mkdir(join(home, "harness-attempts", id), { recursive: true });
		await writeFile(
			join(home, "harness-attempts", id, "launch.json"),
			JSON.stringify({
				harness: id === "custom" ? "custom" : "claude",
				...(id === "custom"
					? {}
					: {
							fingerprint: JSON.stringify([
								"claude",
								"/repo",
								"Prompt",
								id === "known" ? "anthropic/claude-sonnet-5" : null,
							]),
						}),
				...(id === "known" ? { effort: "high" } : {}),
			}),
		);
	}
});
// The directory goes before the database closes, because a failed close
// would otherwise leave it in the temporary directory.
afterAll(async () => {
	await rm(home, { recursive: true, force: true });
	await db.$client.close();
});

test("restore profiles from exact launch records without replacing existing or unknown data", async () => {
	await db.transaction((tx) => restoreHarnesses({ home }, tx));
	const result = await db.execute(sql`SELECT id,harness FROM agent_runs ORDER BY id`);
	const values = Object.fromEntries(result.rows.map((row) => [row.id, row.harness]));
	expect(values.known).toMatchObject({ preset: "claude", model: "anthropic/claude-sonnet-5", effort: "high" });
	expect(values.unknown).toMatchObject({ preset: "claude" });
	expect(values.unknown).not.toHaveProperty("model");
	expect(values.existing).toEqual(harness);
	expect(values.missing).toBeNull();
	expect(values.custom).toBeNull();
	await writeFile(join(home, "harness-attempts", "known", "launch.json"), "not read after repair");
	await db.transaction((tx) => restoreHarnesses({ home }, tx));
	expect((await db.execute(sql`SELECT harness FROM agent_runs WHERE id='known'`)).rows[0]!.harness).toEqual(
		values.known,
	);
});
