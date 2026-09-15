import { afterEach, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("new projects persist explicit native settings and only a person sets the directory", async () => {
	t = await createTestApp();
	const managerConfig = { personaId: null, concurrency: 3, directory: "/tmp", ade: "native" as const };
	const project = await t.client.projects.create({ key: "NEW", name: "Native project", managerConfig });
	expect(project.managerConfig).toMatchObject({ ade: "native", directory: "/tmp" });
	expect(project.managerConfig).not.toHaveProperty("trustedDirectory");
	await expect(
		t.as("agent:fixture").projects.create({ key: "BAD", name: "Agent directory", managerConfig }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const agentProject = await t
		.as("agent:fixture")
		.projects.create({ key: "AGT", name: "Agent project", managerConfig: { ...managerConfig, directory: "" } });
	expect(agentProject.managerConfig?.directory).toBe("");
	const defaults = await t.client.projects.create({ key: "OLD", name: "Default project" });
	expect(defaults.managerConfig?.ade).toBe("native");
});

test("a person can change the project directory but an agent cannot", async () => {
	t = await createTestApp();
	const project = await t.client.projects.create({ key: "DIR", name: "Directory" });
	const managerConfig = { ...project.managerConfig!, directory: "/tmp" };
	await t.client.projects.update({ project: "DIR", managerConfig });
	expect((await t.client.projects.get({ project: "DIR" })).managerConfig?.directory).toBe("/tmp");
	await expect(
		t.as("agent:fixture").projects.update({ project: "DIR", managerConfig: { ...managerConfig, directory: "/var" } }),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await t.as("agent:fixture").projects.update({ project: "DIR", managerConfig: { ...managerConfig, concurrency: 5 } });
	expect((await t.client.projects.get({ project: "DIR" })).managerConfig).toMatchObject({
		directory: "/tmp",
		concurrency: 5,
	});
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
