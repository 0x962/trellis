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
const requestId = "b932c824-3f5a-4528-8170-ece442342777";
test("migration API reports actionable agent IDs and stale preview errors", async () => {
	t = await createTestApp();
	await t.seedProject("MIG");
	const before = await t.client.nativeMigration.inventory({ project: "MIG" });
	const runId = ulid();
	await t.editServerTx((tx) =>
		tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,created_at,updated_at) VALUES (${runId},'Fixture','Fixture','builder','',${before.projectId},'MIG','interrupted','superset',now(),now())`,
		),
	);
	const input = { project: "MIG", expectedVersion: before.version, directory: "/tmp/migration-fixture", requestId };
	await expect(t.client.nativeMigration.apply(input)).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ message: expect.stringContaining("inventory") }] },
	});
	const blocked = await t.client.nativeMigration.inventory({ project: "MIG" });
	expect(blocked.blockers[0]).toMatchObject({ id: runId, projectId: before.projectId, kind: "agent" });
	await expect(t.client.nativeMigration.apply({ ...input, expectedVersion: blocked.version })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ message: expect.stringContaining(runId) }] },
	});
	await expect(
		t.as("agent:fixture").nativeMigration.apply({ ...input, expectedVersion: blocked.version }),
	).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ message: expect.stringContaining("person") }] },
	});
});
test("migration API round trips preview, replay, and rollback without a runtime launch", async () => {
	t = await createTestApp();
	await t.seedProject("MIG");
	const before = await t.client.nativeMigration.inventory({ project: "MIG" });
	const input = { project: "MIG", expectedVersion: before.version, directory: "/tmp/migration-fixture", requestId };
	const migration = await t.client.nativeMigration.apply(input);
	expect(await t.client.nativeMigration.apply(input)).toEqual(migration);
	const current = await t.client.nativeMigration.inventory({ project: "MIG" });
	expect(current.managerConfig).toMatchObject({ ade: "native", dispatchPaused: true, trustedDirectory: false });
	await expect(
		t.as("agent:fixture").nativeMigration.rollback({ migrationId: migration.id, expectedVersion: current.version }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await t.client.nativeMigration.rollback({ migrationId: migration.id, expectedVersion: current.version });
	expect((await t.client.nativeMigration.inventory({ project: "MIG" })).originalConfig).toEqual(before.originalConfig);
	expect(await t.client.agentRuns.list({ project: "MIG" })).toHaveLength(0);
});
