import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { originDir } from "../../../../../../test/originDir.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("people and agents create native projects without repository approval", async () => {
	t = await createTestApp();
	const managerConfig = { personaId: null, concurrency: 3, directory: "/tmp", ade: "native" as const };
	const project = await t.client.projects.create({ key: "NEW", name: "Native project", managerConfig });
	expect(project.managerConfig).not.toHaveProperty("trustedDirectory");
	const created = await t.as("agent:fixture").projects.create({ key: "AGT", name: "Agent project", managerConfig });
	expect(created.managerConfig!.directory).toBe("/tmp");
	const updated = await t
		.as("agent:fixture")
		.projects.update({ project: "AGT", managerConfig: { ...created.managerConfig!, directory: "/tmp/other" } });
	expect(updated.managerConfig!.directory).toBe("/tmp/other");
	const defaults = await t.client.projects.create({ key: "OLD", name: "Default project" });
	expect(defaults.managerConfig!.ade).toBe("native");
});

test("an agent updates a migrated project with legacy false permissions without human approval", async () => {
	t = await createTestApp();
	const project = await t.client.projects.create({ key: "PER", name: "Permissions" });
	const migration = await readFile(
		join(originDir(import.meta.dir), "../../drizzle/0045_remove_repository_approval.sql"),
		"utf8",
	);
	await t.editServerTx(async (tx) => {
		await tx.execute(
			sql`UPDATE projects SET manager_config=manager_config || '{"trustedDirectory":false,"allowAllPermissions":false}'::jsonb WHERE id=${project.id}`,
		);
		await tx.execute(sql.raw(migration));
	});
	const updated = await t
		.as("agent:fixture")
		.projects.update({ project: "PER", managerConfig: { personaId: null, concurrency: 7, directory: "/tmp/moved" } });
	expect(updated.managerConfig).not.toHaveProperty("allowAllPermissions");
	expect(updated.managerConfig).not.toHaveProperty("trustedDirectory");
	expect(updated.managerConfig).toMatchObject({ directory: "/tmp/moved", concurrency: 7 });
});
