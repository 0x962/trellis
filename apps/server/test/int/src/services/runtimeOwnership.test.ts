import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("new projects persist explicit native settings and require human repository trust", async () => {
	t = await createTestApp();
	const managerConfig = { personaId: null, concurrency: 3, directory: "/tmp", ade: "native" as const };
	const project = await t.client.projects.create({ key: "NEW", name: "Native project", managerConfig });
	expect(project.managerConfig).toMatchObject({ ade: "native", trustedDirectory: false });
	await expect(
		t.as("agent:fixture").projects.create({
			key: "BAD",
			name: "Unapproved trust",
			managerConfig: { ...managerConfig, trustedDirectory: true },
		}),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const legacy = await t.client.projects.create({ key: "OLD", name: "Default project" });
	expect(legacy.managerConfig?.ade).toBe("superset");
});

test("a runtime change waits for legacy and persona processes to end", async () => {
	t = await createTestApp();
	await t.seedProject("OWN");
	const project = await t.client.projects.get({ project: "OWN" });
	const legacy = ulid();
	await t.serverTx((tx) =>
		tx.execute(sql`INSERT INTO agent_sessions
		(id, project_id, role, runner, state, name, title, created_at, updated_at)
		VALUES (${legacy}, ${project.id}, 'manager', 'superset', 'waiting', 'Fixture', 'Fixture', now(), now())`),
	);
	const managerConfig = { personaId: null, concurrency: 3, directory: "/tmp", ade: "native" as const };
	await expect(t.client.projects.update({ project: "OWN", managerConfig })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	await t.serverTx((tx) => tx.execute(sql`UPDATE agent_sessions SET state = 'stopped' WHERE id = ${legacy}`));
	const run = ulid();
	await t.serverTx((tx) =>
		tx.execute(sql`INSERT INTO agent_runs
		(id, name, persona_name, kind, instruction, project_id, project_path, state, runtime, created_at, updated_at)
		VALUES (${run}, 'Fixture', 'Fixture', 'builder', 'Wait', ${project.id}, 'OWN', 'interrupted', 'superset', now(), now())`),
	);
	await expect(t.client.projects.update({ project: "OWN", managerConfig })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	await t.serverTx((tx) => tx.execute(sql`UPDATE agent_runs SET state = 'stopped' WHERE id = ${run}`));
	expect((await t.client.projects.update({ project: "OWN", managerConfig })).managerConfig?.ade).toBe("native");
});
