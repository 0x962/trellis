import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../../test/originDir.ts";
import { seedActors, seedChild, seedDefaultBuilder, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
test("the migration copies the nearest builder defaults into existing In Progress columns", async () => {
	await h.read(async (tx) => {
		await seedActors(tx);
		const root = await seedRoot(tx, "MIG");
		const parentPersona = await seedDefaultBuilder(tx, root);
		const rootStatuses = await seedStatuses(tx, root);
		const child = await seedChild(tx, root, root, "child");
		const childStatuses = await seedStatuses(tx, child);
		const own = await seedChild(tx, root, root, "own");
		const ownPersona = await seedDefaultBuilder(tx, own);
		const ownStatuses = await seedStatuses(tx, own);
		const migration = await readFile(
			join(originDir(import.meta.dir), "../../../drizzle/0065_column_workers.sql"),
			"utf8",
		);
		await tx.execute(
			sql.raw(migration.split("--> statement-breakpoint").find((part) => part.includes("WITH RECURSIVE ancestors"))!),
		);
		const result = await tx.execute(sql`SELECT id,agent_config FROM statuses WHERE category='started'`);
		const configs = new Map(result.rows.map((row) => [row.id, row.agent_config]));
		expect(configs.get(rootStatuses.started)).toMatchObject({ personaId: parentPersona, accountId: null });
		expect(configs.get(childStatuses.started)).toMatchObject({ personaId: parentPersona, accountId: null });
		expect(configs.get(ownStatuses.started)).toMatchObject({ personaId: ownPersona, accountId: null });
		expect(
			(await tx.execute(sql`SELECT agent_config FROM statuses WHERE id=${rootStatuses.todo}`)).rows[0]!.agent_config,
		).toBeNull();
	});
});
