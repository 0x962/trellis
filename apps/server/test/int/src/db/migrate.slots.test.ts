import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { openDb } from "../../../../src/db/client.ts";
import { migrate } from "../../../../src/db/migrate.ts";
import { seedStatus } from "../../../fixtures/projects.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

test("slot migrations preserve explicit WIP limits and replace worker capacity instructions", async () => {
	const source = join(originDir(import.meta.dir), "../../drizzle");
	const directory = mkdtempSync(join(process.env.TRELLIS_HOME!, "slot-migration-"));
	cpSync(source, directory, { recursive: true });
	const path = join(directory, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(path, "utf8"));
	journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 62);
	writeFileSync(path, JSON.stringify(journal));
	const db = await openDb(":memory:");
	try {
		await migrate(db, directory);
		await db.execute(sql`INSERT INTO projects (id,root_id,key,slug,name,position,manager_config,created_at,updated_at)
			VALUES ('slots','slots','SLT','slt','Slots',0,'{"personaId":null,"directory":"/work","concurrency":26}'::jsonb,now(),now())`);
		for (const [id, name, category, limit] of [
			["todo", "Todo", "todo", null],
			["started", "In Progress", "started", null],
			["limited", "Implementation", "started", 4],
			["review", "Review", "review", null],
		] as const) {
			await seedStatus(
				db,
				{
					projectId: "slots",
					name,
					category,
					reviewer: category === "review" ? "agent" : null,
					position: ["todo", "started", "limited", "review"].indexOf(id),
					isDefault: id === "todo",
					wipLimit: limit,
				},
				{ id },
			);
		}
		const footer =
			"## Idle worker capacity\n\nAn idle worker uses no worker slot. An open assignment or a held conversation does not consume capacity.";
		await db.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
			VALUES ('manager','Trellis','manager',${"Advance each ticket as soon as its own prerequisites complete. Start independent work within the project capacity.\n\n" + footer},now(),now()),
			('builder','Builder','builder',${footer},now(),now())`);
		await migrate(db);
		expect(
			(await db.execute(sql`SELECT manager_config FROM projects WHERE id='slots'`)).rows[0]!.manager_config,
		).toEqual({ personaId: null, directory: "/work" });
		expect(
			(await db.execute(sql`SELECT id,wip_limit FROM statuses WHERE project_id='slots' ORDER BY position`)).rows,
		).toEqual([
			{ id: "todo", wip_limit: null },
			{ id: "started", wip_limit: 9 },
			{ id: "limited", wip_limit: 4 },
			{ id: "review", wip_limit: null },
		]);
		expect(
			(
				await db.execute(
					sql`SELECT column_name FROM information_schema.columns WHERE table_name='manager_delegations' AND column_name='capacity'`,
				)
			).rows,
		).toEqual([]);
		const personas = (await db.execute(sql`SELECT name,kind,instruction FROM personas`)).rows;
		for (const persona of personas) {
			expect(persona.instruction as string).not.toMatch(
				/worker slot|free slots|capacityReminder|submanagers\.resize|## Active worker capacity|## Idle worker capacity/,
			);
			if (persona.kind === "builder") expect(persona.instruction as string).toContain("## Heartbeat");
		}
		const manager = personas.find((persona) => persona.name === "Trellis")!;
		expect(manager.instruction as string).toContain("## Automatic builders");
		await db.execute(
			sql`UPDATE personas SET instruction=instruction || '\nCustom project instruction.' WHERE name='Trellis'`,
		);
		const before = (await db.execute(sql`SELECT instruction FROM personas WHERE name='Trellis'`)).rows[0]!.instruction;
		for (const statement of readFileSync(join(source, "0064_remove_slot_instructions.sql"), "utf8").split(
			"--> statement-breakpoint",
		))
			if (statement.trim()) await db.execute(sql.raw(statement));
		expect((await db.execute(sql`SELECT instruction FROM personas WHERE name='Trellis'`)).rows[0]!.instruction).toBe(
			before,
		);
		await db.transaction(assertStatusInvariant);
	} finally {
		await db.$client.close();
		rmSync(directory, { recursive: true, force: true });
	}
});
