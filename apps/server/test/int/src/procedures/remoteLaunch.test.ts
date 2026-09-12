import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUPERSET_ADE_COMMANDS } from "@trellis/api";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let directory: string;
let personaId: string;
beforeEach(async () => {
	directory = mkdtempSync(join(tmpdir(), "trellis-remote-"));
	const bin = join(directory, "superset.ts");
	copyFileSync(new URL("../../../../../../test/agent-runs/superset.ts", import.meta.url), bin);
	chmodSync(bin, 0o755);
	t = await createTestApp({ supersetBin: bin });
	await t.seedProject("REM");
	await t.client.projects.setRepos({ project: "REM", repos: [{ owner: "example", repo: "code" }] });
	personaId = (await t.client.personas.create({ name: "Manager", kind: "manager", instruction: "Manage." })).id;
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
for (const adeCommands of [null, SUPERSET_ADE_COMMANDS]) {
	test(`a remote ${adeCommands ? "preset" : "legacy"} launch reports an unreachable localhost address`, async () => {
		await t.client.projects.update({
			project: "REM",
			managerConfig: { personaId, directory, concurrency: 3, supersetHostId: "remote-machine", adeCommands },
		});
		const run = await t.client.agentRuns.start({ personaId, project: "REM" });
		expect(run.state).toBe("failed");
		expect(run.error).toContain("Mac mini");
		expect(run.error).toContain("localhost");
		expect(run.error).toContain("This machine");
		expect(readFileSync(join(directory, "calls.jsonl"), "utf8")).not.toContain('"create"');
	});
}

test("a named local Superset host can use the localhost Trellis address", async () => {
	await t.client.projects.update({
		project: "REM",
		managerConfig: { personaId, directory, concurrency: 3, supersetHostId: "local-machine" },
	});
	const run = await t.client.agentRuns.start({ personaId, project: "REM" });
	expect(run.state, run.error ?? "").toBe("running");
});
