import { afterEach, expect, test } from "bun:test";
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
	const defaults = await t.client.projects.create({ key: "OLD", name: "Default project" });
	expect(defaults.managerConfig?.ade).toBe("native");
});
