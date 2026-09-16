import { afterEach, expect, test } from "bun:test";
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

test("a person can change tool permissions but an agent cannot enable them", async () => {
	t = await createTestApp();
	const project = await t.client.projects.create({ key: "PER", name: "Permissions" });
	expect(project.managerConfig?.allowAllPermissions).toBe(true);
	const managerConfig = { ...project.managerConfig!, allowAllPermissions: false };
	await t.client.projects.update({ project: "PER", managerConfig });
	expect((await t.client.projects.get({ project: "PER" })).managerConfig?.allowAllPermissions).toBe(false);
	await expect(
		t
			.as("agent:fixture")
			.projects.update({ project: "PER", managerConfig: { ...managerConfig, allowAllPermissions: true } }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await t.client.projects.update({ project: "PER", managerConfig: { ...managerConfig, allowAllPermissions: true } });
	expect((await t.client.projects.get({ project: "PER" })).managerConfig?.allowAllPermissions).toBe(true);
});
