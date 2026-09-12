import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

// The one manager of a project: its start, its pause, and the resume of
// its session after the pause.

let t: TestApp;
let dir: string;
let manager: string;
beforeEach(async () => {
	dir = mkdtempSync(join(tmpdir(), "trellis-manager-"));
	const bin = join(dir, "superset.ts");
	copyFileSync(new URL("../../../../../../test/agent-runs/superset.ts", import.meta.url), bin);
	chmodSync(bin, 0o755);
	t = await createTestApp({ supersetBin: bin });
	await t.seedProject("RUN");
	await t.client.projects.setRepos({ project: "RUN", repos: [{ owner: "example", repo: "code" }] });
	manager = (
		await t.client.personas.create({ name: "Trellis Manager", kind: "manager", instruction: "Manage the project." })
	).id;
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const start = (body: unknown) => t.api("/api/agent-runs", { method: "POST", body });
const stop = (id: string) => t.api(`/api/agent-runs/${id}/stop`, { method: "POST", body: {} });
const calls = () =>
	readFileSync(join(dir, "calls.jsonl"), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as string[]);
const commandOf = (args: string[]) => args[args.indexOf("--command") + 1]!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("a start names the session, and a start after a pause resumes it in the same workspace", async () => {
	const first = await start({ personaId: manager, project: "RUN" });
	expect(first.status).toBe(201);
	expect(first.body).toMatchObject({ kind: "manager", state: "running", sessionLost: false });
	expect(first.body.sessionId).toMatch(UUID);
	const created = calls().find((args) => args[1] === "create")!;
	expect(commandOf(created)).toContain(`--session-id '${first.body.sessionId}'`);
	expect((await stop(first.body.id)).body.state).toBe("stopped");
	const second = await start({ personaId: manager, project: "RUN" });
	expect(second.status).toBe(201);
	expect(second.body).toMatchObject({
		id: first.body.id,
		state: "running",
		workspaceId: first.body.workspaceId,
		sessionId: first.body.sessionId,
	});
	const terminals = calls().filter((args) => args[0] === "terminals" && args[1] === "create");
	expect(terminals).toHaveLength(1);
	expect(terminals[0]).toContain(first.body.workspaceId);
	expect(commandOf(terminals[0]!)).toContain(`--resume '${first.body.sessionId}'`);
	expect(commandOf(terminals[0]!)).not.toContain("--session-id");
	expect(calls().filter((args) => args[0] === "ws" && args[1] === "create")).toHaveLength(1);
});

test("a resume whose terminal exits at once marks the session lost and names where the agent ran", async () => {
	const first = await start({ personaId: manager, project: "RUN" });
	await stop(first.body.id);
	writeFileSync(join(dir, "exited"), "");
	const second = await start({ personaId: manager, project: "RUN" });
	expect(second.status).toBe(201);
	expect(second.body).toMatchObject({ id: first.body.id, state: "failed", sessionLost: true });
	expect(second.body.error).toContain(`Could not resume agent session ${first.body.sessionId}`);
	expect(second.body.error).toContain(`Superset workspace ${first.body.workspaceId} on this machine`);
	expect(second.body.error).toContain("Agent output");
	rmSync(join(dir, "exited"));
	// The person asks for a new session: the row stays, the workspace stays,
	// and the agent gets a fresh session id.
	const fresh = await start({ personaId: manager, project: "RUN", newSession: true });
	expect(fresh.status).toBe(201);
	expect(fresh.body).toMatchObject({
		id: first.body.id,
		state: "running",
		sessionLost: false,
		error: null,
		workspaceId: first.body.workspaceId,
	});
	expect(fresh.body.sessionId).toMatch(UUID);
	expect(fresh.body.sessionId).not.toBe(first.body.sessionId);
	const terminals = calls().filter((args) => args[0] === "terminals" && args[1] === "create");
	expect(commandOf(terminals.at(-1)!)).toContain(`--session-id '${fresh.body.sessionId}'`);
});

test("a start takes the newest manager row of the project and leaves an older failed one as history", async () => {
	const initial = await start({ personaId: manager, project: "RUN" });
	await stop(initial.body.id);
	await t.serverTx((tx) =>
		tx.execute(sql`
			INSERT INTO agent_runs (id, name, persona_name, kind, instruction, project_id, project_path, state, error, created_at, updated_at)
			SELECT '01J9Z0000000000000000000A0', 'Cleo Wren', 'Manager', 'manager', 'Manage.', id, 'RUN', 'failed', 'Project is not set up on this host', NOW() - interval '1 hour', NOW()
			FROM projects WHERE key = 'RUN'
		`),
	);
	const first = await start({ personaId: manager, project: "RUN" });
	expect(first.status).toBe(201);
	expect(first.body.id).not.toBe("01J9Z0000000000000000000A0");
	await stop(first.body.id);
	const second = await start({ personaId: manager, project: "RUN" });
	expect(second.body).toMatchObject({ id: first.body.id, state: "running" });
	const listed = await t.api("/api/agent-runs?project=RUN");
	expect(listed.body.map((run: { id: string }) => run.id)).toEqual([first.body.id, "01J9Z0000000000000000000A0"]);
});

test("a project's own agent commands run in place of Claude, with the session id of the run", async () => {
	await t.client.projects.update({
		project: "RUN",
		managerConfig: {
			personaId: null,
			concurrency: 3,
			directory: "",
			agentCommand: "codex --session {{sessionId}} {{prompt}}",
			agentResumeCommand: "codex resume {{sessionId}} {{resumeText}}",
		},
	});
	const first = await start({ personaId: manager, project: "RUN" });
	expect(first.status).toBe(201);
	const created = calls().find((args) => args[1] === "create")!;
	expect(commandOf(created)).toContain(`codex --session '${first.body.sessionId}' 'Manage the project.`);
	expect(commandOf(created)).not.toContain("claude");
	await stop(first.body.id);
	const second = await start({ personaId: manager, project: "RUN" });
	expect(second.body.state).toBe("running");
	const attached = calls()
		.filter((args) => args[0] === "terminals" && args[1] === "create")
		.at(-1)!;
	expect(commandOf(attached)).toContain(`codex resume '${first.body.sessionId}' 'trellis: your session resumed`);
});

test("a running manager refuses a second start until it pauses", async () => {
	const first = await start({ personaId: manager, project: "RUN" });
	expect((await start({ personaId: manager, project: "RUN" })).status).toBe(409);
	await stop(first.body.id);
	expect((await start({ personaId: manager, project: "RUN" })).status).toBe(201);
});

test("a new session creates a workspace when the previous workspace is missing", async () => {
	const first = await start({ personaId: manager, project: "RUN" });
	await stop(first.body.id);
	writeFileSync(join(dir, "workspace-missing"), "");
	const failed = await start({ personaId: manager, project: "RUN" });
	expect(failed.body).toMatchObject({ state: "failed", sessionLost: true });
	const fresh = await start({ personaId: manager, project: "RUN", newSession: true });
	expect(fresh.body).toMatchObject({ id: first.body.id, state: "running", sessionLost: false });
	expect(fresh.body.workspaceId).not.toBe(first.body.workspaceId);
	expect(fresh.body.sessionId).not.toBe(first.body.sessionId);
});

test("project lookup, follow-up, and output use the configured Superset host", async () => {
	await t.client.projects.update({
		project: "RUN",
		managerConfig: { personaId: manager, concurrency: 3, directory: "", supersetHostId: "remote-machine" },
	});
	writeFileSync(join(dir, "expected-host"), "remote-machine");
	const run = await start({ personaId: manager, project: "RUN" });
	expect(run.body.state).toBe("running");
	expect(
		(await t.api(`/api/agent-runs/${run.body.id}/send`, { method: "POST", body: { text: "Next task" } })).status,
	).toBe(200);
	const output = await t.api(`/api/agent-runs/${run.body.id}/output`);
	expect(output.status).toBe(200);
	expect(output.body.text).toContain("Agent output");
});

test("terminal read and follow-up failures expose the runner error", async () => {
	const run = await start({ personaId: manager, project: "RUN" });
	writeFileSync(join(dir, "fail"), "");
	const output = await t.api(`/api/agent-runs/${run.body.id}/output`);
	expect(output.status).toBe(503);
	expect(output.body).toMatchObject({ code: "RUNNER_UNAVAILABLE" });
	expect(output.body.message).toContain("Superset is unavailable");
	const sent = await t.api(`/api/agent-runs/${run.body.id}/send`, { method: "POST", body: { text: "Next task" } });
	expect(sent.status).toBe(503);
	expect(sent.body.message).toContain("Superset is unavailable");
});
