import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUPERSET_ADE_COMMANDS } from "@trellis/api";
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
	t = await createTestApp({ supersetBin: bin, host: "192.168.1.20" });
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
			harnessCommands: SUPERSET_ADE_COMMANDS,
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
			ade: "tmux",
			harness: { preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" },
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

test("the Superset preset reports a lost session and starts a fresh session in the same workspace", async () => {
	await t.client.projects.update({
		project: "PRE",
		managerConfig: { personaId, concurrency: 3, directory, harnessCommands: SUPERSET_ADE_COMMANDS },
	});
	const first = await t.client.agentRuns.start({ personaId, project: "PRE" });
	await t.client.agentRuns.stop({ id: first.id });
	writeFileSync(join(directory, "exited"), "");
	const failed = await t.client.agentRuns.start({ personaId, project: "PRE" });
	expect(failed).toMatchObject({ state: "failed", sessionLost: true, sessionId: first.sessionId });
	rmSync(join(directory, "exited"));
	const fresh = await t.client.agentRuns.start({ personaId, project: "PRE", newSession: true });
	expect(fresh).toMatchObject({ state: "running", sessionLost: false, workspaceId: first.workspaceId });
	expect(fresh.sessionId).not.toBe(first.sessionId);
	const calls = readFileSync(join(directory, "calls.jsonl"), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as string[]);
	const launched = calls.filter((args) => args[0] === "terminals" && args[1] === "create").at(-1)!;
	expect(launched[launched.indexOf("--command") + 1]).toContain(`--session-id '${fresh.sessionId}'`);
});

test("the Superset preset uses the configured host to find the project and control the terminal", async () => {
	await t.client.projects.update({
		project: "PRE",
		managerConfig: {
			personaId,
			concurrency: 3,
			directory,
			supersetHostId: "remote-machine",
			harnessCommands: SUPERSET_ADE_COMMANDS,
		},
	});
	writeFileSync(join(directory, "expected-host"), "remote-machine");
	const run = await t.client.agentRuns.start({ personaId, project: "PRE" });
	expect(run.state).toBe("running");
	await t.client.agentRuns.send({ id: run.id, text: "Next task" });
	expect((await t.client.agentRuns.output({ id: run.id })).text).toContain("Agent output");
});

test("a new Superset session replaces a missing workspace", async () => {
	await t.client.projects.update({
		project: "PRE",
		managerConfig: { personaId, concurrency: 3, directory, adeCommands: SUPERSET_ADE_COMMANDS },
	});
	const first = await t.client.agentRuns.start({ personaId, project: "PRE" });
	await t.client.agentRuns.stop({ id: first.id });
	writeFileSync(join(directory, "workspace-missing"), "");
	const fresh = await t.client.agentRuns.start({ personaId, project: "PRE", newSession: true });
	expect(fresh.state).toBe("running");
	expect(fresh.workspaceId).not.toBe(first.workspaceId);
});

test("a Superset host change starts on the new host with a new workspace", async () => {
	await t.client.projects.update({
		project: "PRE",
		managerConfig: { personaId, concurrency: 3, directory, adeCommands: SUPERSET_ADE_COMMANDS },
	});
	const first = await t.client.agentRuns.start({ personaId, project: "PRE" });
	await t.client.agentRuns.stop({ id: first.id });
	const config = (await t.client.projects.get({ project: "PRE" })).managerConfig!;
	await t.client.projects.update({ project: "PRE", managerConfig: { ...config, supersetHostId: "remote-machine" } });
	const next = await t.client.agentRuns.start({ personaId, project: "PRE" });
	expect(next.state).toBe("running");
	expect(next.workspaceId).not.toBe(first.workspaceId);
	expect(next.sessionId).not.toBe(first.sessionId);
});

test("the Terminal preset opens an AppleScript attachment to its managed tmux session", async () => {
	const { TERMINAL_ADE_COMMANDS } = await import("@trellis/api");
	const script = join(directory, "terminal.applescript");
	const commands = {
		...TERMINAL_ADE_COMMANDS,
		start: TERMINAL_ADE_COMMANDS.start.replace("osascript >/dev/null", `/bin/cat > '${script}'`),
	};
	await t.client.projects.update({
		project: "PRE",
		managerConfig: {
			personaId,
			concurrency: 3,
			directory,
			ade: "terminal",
			adeCommands: commands,
			harness: { preset: "custom", startCommand: "/bin/cat", resumeCommand: "/bin/cat" },
		},
	});
	const run = await t.client.agentRuns.start({ personaId, project: "PRE" });
	expect(run.state, run.error ?? "").toBe("running");
	expect(readFileSync(script, "utf8")).toContain(`attach-session -t '${run.id}'`);
	const compiled = Bun.spawn(["osacompile", "-o", join(directory, "terminal.scpt"), script], {
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(await compiled.exited, await new Response(compiled.stderr).text()).toBe(0);
	await t.client.agentRuns.send({ id: run.id, text: "Terminal follow-up" });
	expect((await t.client.agentRuns.output({ id: run.id })).text).toContain("Terminal follow-up");
});
