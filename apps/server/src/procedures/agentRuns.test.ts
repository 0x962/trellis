import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../test/helpers/app.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";

let t: TestApp;
let dir: string;
let ticket: string;
let builder: string;
let manager: string;
beforeEach(async () => {
	dir = mkdtempSync(join(tmpdir(), "trellis-runner-"));
	const bin = join(dir, "superset.ts");
	copyFileSync(new URL("../../../../test/agent-runs/superset.ts", import.meta.url), bin);
	chmodSync(bin, 0o755);
	t = await createTestApp({ supersetBin: bin });
	await t.seedProject("RUN");
	await t.client.projects.setRepos({ project: "RUN", repos: [{ owner: "example", repo: "code" }] });
	ticket = (await t.createTicket({ project: "RUN", title: "Build the feature" })).identifier;
	builder = (
		await t.client.personas.create({
			name: "Feature Builder",
			kind: "builder",
			instruction: "Build carefully. Keep '$()' literal.",
		})
	).id;
	manager = (
		await t.client.personas.create({ name: "Trellis Manager", kind: "manager", instruction: "Manage the project." })
	).id;
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const start = (body: unknown) => t.api("/api/agent-runs", { method: "POST", body });
const calls = () =>
	readFileSync(join(dir, "calls.jsonl"), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as string[]);

test("assignment launches a named agent with the selected prompt and retains its snapshot", async () => {
	const result = await start({ personaId: builder, ticket });
	expect(result.status).toBe(201);
	expect(result.body).toMatchObject({
		state: "running",
		personaId: builder,
		personaName: "Feature Builder",
		kind: "builder",
		ticketIdentifier: ticket,
	});
	expect(result.body.name).toMatch(/^[A-Z][a-z]+$/);
	const launch = calls().find((args) => args[1] === "create")!;
	expect(launch).toContain("superset-project");
	const command = launch[launch.indexOf("--command") + 1]!;
	expect(command).toContain("TRELLIS_ACTOR");
	expect(command).toContain(result.body.id);
	expect(command).toContain("Build carefully.");
	expect(command).toContain("Build the feature");
	await t.client.personas.update({ id: builder, name: "Edited", kind: "reviewer", instruction: "Different prompt." });
	await t.client.personas.delete({ id: builder });
	const listed = await t.api(`/api/agent-runs?ticket=${ticket}`);
	expect(listed.body[0]).toMatchObject({
		id: result.body.id,
		personaName: "Feature Builder",
		kind: "builder",
		instruction: "Build carefully. Keep '$()' literal.",
	});
});

test("a ticket takes more than one agent at a time, up to the project limit", async () => {
	const results = await Promise.all([start({ personaId: builder, ticket }), start({ personaId: builder, ticket })]);
	expect(results.map((r) => r.status)).toEqual([201, 201]);
	expect(calls().filter((args) => args[1] === "create")).toHaveLength(2);
	// The project limit counts the agents at work in the whole project, so a
	// limit of two refuses the third.
	await t.client.projects.update({
		project: "RUN",
		managerConfig: { personaId: null, concurrency: 2, directory: "" },
	});
	expect((await start({ personaId: builder, ticket })).status).toBe(409);
});

test("a manager starts from a manager persona and the project context", async () => {
	const result = await start({ personaId: manager, project: "RUN" });
	expect(result.status).toBe(201);
	expect(result.body).toMatchObject({ kind: "manager", ticketId: null, projectPath: "RUN", state: "running" });
	expect((await start({ personaId: manager, project: "RUN" })).status).toBe(409);
	expect((await start({ personaId: manager, ticket })).status).toBe(400);
	expect((await start({ personaId: builder, project: "RUN" })).status).toBe(400);
});

test("missing actors and archived projects cannot start agents", async () => {
	expect(
		(await t.api("/api/agent-runs", { method: "POST", body: { personaId: builder, ticket }, actor: null })).status,
	).toBe(400);
	await t.client.projects.update({ project: "RUN", archived: true });
	expect((await start({ personaId: builder, ticket })).status).toBe(409);
});

test("a failed launch stays visible and releases the ticket for a later start", async () => {
	writeFileSync(join(dir, "fail"), "");
	const result = await start({ personaId: builder, ticket });
	expect(result.status).toBe(201);
	expect(result.body.state).toBe("failed");
	expect(result.body.error).toContain("Superset is unavailable");
	expect((await t.api(`/api/agent-runs?ticket=${ticket}`)).body[0].id).toBe(result.body.id);
});

test("stop closes only the run terminal and permits a new assignment", async () => {
	const result = await start({ personaId: builder, ticket });
	expect(result.status).toBe(201);
	const stopped = await t.api(`/api/agent-runs/${result.body.id}/stop`, { method: "POST", body: {} });
	expect(stopped.status).toBe(200);
	expect(stopped.body.state).toBe("stopped");
	expect(calls().find((args) => args[1] === "close")).toEqual([
		"terminals",
		"close",
		"--workspace",
		result.body.workspaceId,
		"--terminal",
		"terminal",
	]);
	expect((await start({ personaId: builder, ticket })).status).toBe(201);
	expect(calls().some((args) => args.includes("delete"))).toBe(false);
});

test("refresh recognizes an exited terminal", async () => {
	const result = await start({ personaId: builder, ticket });
	expect(result.status).toBe(201);
	writeFileSync(join(dir, "exited"), "");
	const refreshed = await t.api(`/api/agent-runs/${result.body.id}/refresh`, { method: "POST", body: {} });
	expect(refreshed.status).toBe(200);
	expect(refreshed.body.state).toBe("exited");
	expect((await start({ personaId: builder, ticket })).status).toBe(201);
});

test("an interrupted startup reconnects to its existing workspace", async () => {
	const result = await start({ personaId: builder, ticket });
	expect(result.status).toBe(201);
	await t.serverTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET state = 'starting', workspace_id = NULL, terminal_id = NULL, url = NULL WHERE id = ${result.body.id}`,
		),
	);
	await t.transport.close();
	await t.transport.start();
	const listed = await t.api(`/api/agent-runs?ticket=${ticket}`);
	expect(listed.body[0].state).toBe("interrupted");
	const refreshed = await t.api(`/api/agent-runs/${result.body.id}/refresh`, { method: "POST", body: {} });
	expect(refreshed.body).toMatchObject({ state: "running", workspaceId: result.body.workspaceId });
	expect(calls().filter((args) => args[1] === "create")).toHaveLength(1);
});

test("a saved launch template supplies literal persona values to Superset", async () => {
	const settings = await t.api("/api/settings");
	expect(settings.body.agentLaunchCommand).toContain("{{superset}}");
	const command =
		"{{superset}} ws create --local --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --tag custom-template --json";
	const saved = await t.api("/api/settings", {
		method: "PUT",
		body: { ...settings.body, agentLaunchCommand: command },
	});
	expect(saved.status).toBe(200);
	const result = await start({ personaId: builder, ticket });
	expect(result.status).toBe(201);
	expect(result.body.state).toBe("running");
	expect(calls().find((args) => args[1] === "create")).toContain("custom-template");
});

test("Superset agents accept follow-ups and expose terminal output", async () => {
	const started = await start({ personaId: builder, ticket });
	const response = await t.api(`/api/agent-runs/${started.body.id}/send`, {
		method: "POST",
		body: { text: "Please address the review." },
	});
	expect(response.status).toBe(200);
	expect(calls().find((args) => args[1] === "send")).toContain("Please address the review.");
	const output = await t.api(`/api/agent-runs/${started.body.id}/output`);
	expect(output.status).toBe(200);
	expect(output.body.text).toContain("Agent output");
});

test.skipIf(!Bun.which("tmux"))(
	"a custom command has a persistent terminal with follow-ups, output, and stop",
	async () => {
		const settings = await t.api("/api/settings");
		const template = "printf 'ready\\n'; while IFS= read -r line; do printf 'reply:%s\\n' \"$line\"; done";
		await t.api("/api/settings", { method: "PUT", body: { ...settings.body, agentLaunchCommand: template } });
		const result = await start({ personaId: builder, ticket });
		expect(result.body).toMatchObject({ state: "running", runtime: "tmux" });
		await t.transport.close();
		await t.transport.start();
		const sent = await t.api(`/api/agent-runs/${result.body.id}/send`, {
			method: "POST",
			body: { text: "follow-up $() ' literal" },
		});
		expect(sent.status).toBe(200);
		await Bun.sleep(100);
		const output = await t.api(`/api/agent-runs/${result.body.id}/output`);
		expect(output.status).toBe(200);
		expect(output.body.text).toContain("reply:follow-up $() ' literal");
		const stopped = await t.api(`/api/agent-runs/${result.body.id}/stop`, { method: "POST", body: {} });
		expect(stopped.body.state).toBe("stopped");
	},
);
