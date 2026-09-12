import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUPERSET_HARNESS_COMMANDS, TMUX_HARNESS_COMMANDS } from "@trellis/api";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let directory: string;
let personaId: string;
beforeEach(async () => {
	directory = mkdtempSync(join(tmpdir(), "trellis-preset-"));
	const bin = join(directory, "superset.ts");
	copyFileSync(new URL("../../../../../../test/agent-runs/superset.ts", import.meta.url), bin);
	chmodSync(bin, 0o755);
	t = await createTestApp({ supersetBin: bin });
	await t.seedProject("PRE");
	await t.client.projects.setRepos({ project: "PRE", repos: [{ owner: "example", repo: "code" }] });
	personaId = (await t.client.personas.create({ name: "Manager", kind: "manager", instruction: "Manage." })).id;
});
afterEach(async () => {
	for (const run of await t.client.agentRuns.list({})) {
		if (run.state === "running") await t.client.agentRuns.stop({ id: run.id });
	}
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("the Superset preset starts, checks, sends, reads, stops, and resumes", async () => {
	await t.client.projects.update({
		project: "PRE",
		managerConfig: {
			personaId,
			concurrency: 3,
			directory,
			harnessCommands: SUPERSET_HARNESS_COMMANDS,
		},
	});
	const run = await t.client.agentRuns.start({ personaId, project: "PRE" });
	expect(run.state).toBe("running");
	expect(run.url).toBe(`superset://workspace/${run.workspaceId}`);
	expect((await t.client.agentRuns.refresh({ id: run.id })).state).toBe("running");
	await t.client.agentRuns.send({ id: run.id, text: "Next task" });
	expect((await t.client.agentRuns.output({ id: run.id })).text).toContain("Agent output");
	await t.client.agentRuns.stop({ id: run.id });
	expect(await t.client.agentRuns.start({ personaId, project: "PRE" })).toMatchObject({
		id: run.id,
		workspaceId: run.workspaceId,
		terminalId: "resumed-terminal",
		state: "running",
	});
});

test("the tmux preset controls a real terminal and restarts a stopped manager", async () => {
	await t.client.projects.update({
		project: "PRE",
		managerConfig: {
			personaId,
			concurrency: 3,
			directory,
			harnessCommands: TMUX_HARNESS_COMMANDS,
			agentCommand: "/bin/cat",
			agentResumeCommand: "/bin/cat",
		},
	});
	const run = await t.client.agentRuns.start({ personaId, project: "PRE" });
	expect(run).toMatchObject({ state: "running", url: null });
	expect((await t.client.agentRuns.refresh({ id: run.id })).state).toBe("running");
	await t.client.agentRuns.send({ id: run.id, text: "Harness follow-up" });
	expect((await t.client.agentRuns.output({ id: run.id })).text).toContain("Harness follow-up");
	await t.client.agentRuns.stop({ id: run.id });
	expect((await t.client.agentRuns.output({ id: run.id })).text).toContain("Harness follow-up");
	expect(await t.client.agentRuns.start({ personaId, project: "PRE" })).toMatchObject({ id: run.id, state: "running" });
});
