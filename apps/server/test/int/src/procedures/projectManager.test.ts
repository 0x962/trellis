import { afterEach, beforeEach, expect, test } from "bun:test";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let manager: string;
let builder: string;
beforeEach(async () => {
	t = await createTestApp();
	await t.seedProject("RUN");
	manager = (await t.client.personas.create({ name: "Manager", kind: "manager", instruction: "Manage." })).id;
	builder = (await t.client.personas.create({ name: "Builder", kind: "builder", instruction: "Build." })).id;
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const configure = (managerConfig: unknown) => t.api("/api/projects/RUN", { method: "PATCH", body: { managerConfig } });

test("project manager settings persist the local directory and harness", async () => {
	const config = {
		personaId: manager,
		concurrency: 2,
		directory: "/tmp/project",
		dispatchPaused: true,
		harness: {
			preset: "custom",
			startCommand: "other-agent {{prompt}}",
			resumeCommand: "other-agent resume {{sessionId}}",
		},
	};
	const saved = await configure(config);
	expect(saved.status).toBe(200);
	expect(saved.body.managerConfig).toEqual(ProjectManagerConfigSchema.parse(config));
	expect((await t.client.projects.get({ project: "RUN" })).managerConfig).toEqual(
		ProjectManagerConfigSchema.parse(config),
	);
});

test("the project rejects a non-manager persona and invalid configuration", async () => {
	for (const config of [
		{ personaId: builder, concurrency: 2, directory: "/tmp/project" },
		{ personaId: manager, concurrency: 0, directory: "/tmp/project" },
		{ personaId: manager, concurrency: 2, directory: "relative/path" },
	])
		expect((await configure(config)).status).toBe(400);
});
