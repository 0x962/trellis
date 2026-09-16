import { afterEach, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;

afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("agent capacity reports the scheduler count and project limit", async () => {
	t = await createTestApp();
	await t.seedProject("CAP");
	await t.client.projects.update({
		project: "CAP",
		managerConfig: { personaId: null, concurrency: 3, directory: "/tmp", ade: "native" },
	});

	expect(await t.client.agentRuns.capacity({ project: "CAP" })).toEqual({ used: 0, limit: 3 });
});
