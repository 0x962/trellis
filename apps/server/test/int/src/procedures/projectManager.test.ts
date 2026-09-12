import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectManagerConfigSchema } from "@trellis/api";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let dir: string;
let manager: string;
let builder: string;
beforeEach(async () => {
	dir = mkdtempSync(join(tmpdir(), "trellis-manager-"));
	const bin = join(dir, "superset.ts");
	copyFileSync(new URL("../../../../../../test/agent-runs/superset.ts", import.meta.url), bin);
	chmodSync(bin, 0o755);
	t = await createTestApp({ supersetBin: bin });
	await t.seedProject("RUN");
	await t.client.projects.setRepos({ project: "RUN", repos: [{ owner: "example", repo: "code" }] });
	manager = (await t.client.personas.create({ name: "Manager", kind: "manager", instruction: "Manage." })).id;
	builder = (await t.client.personas.create({ name: "Builder", kind: "builder", instruction: "Build." })).id;
});
afterEach(async () => {
	for (const run of await t.client.agentRuns.list({})) {
		if (run.runtime === "tmux" && run.state === "running") await t.client.agentRuns.stop({ id: run.id });
	}
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const configure = (managerConfig: unknown) => t.api("/api/projects/RUN", { method: "PATCH", body: { managerConfig } });

test("project manager settings persist and enter the manager launch context", async () => {
	const config = {
		personaId: manager,
		concurrency: 2,
		directory: dir,
		enabled: true,
		supersetHostId: null,
		ade: "superset" as const,
		adeCommand: "",
		adeResumeCommand: "",
		agentCommand: "other-agent --prompt {{prompt}}",
		agentResumeCommand: "other-agent resume --prompt {{prompt}}",
		harnessCommands: null,
	};
	const saved = await configure(config);
	expect(saved.status).toBe(200);
	expect(saved.body.managerConfig).toEqual(ProjectManagerConfigSchema.parse(config));
	expect((await t.client.projects.get({ project: "RUN" })).managerConfig).toEqual(
		ProjectManagerConfigSchema.parse(config),
	);
	await t.client.agentRuns.start({ personaId: manager, project: "RUN" });
	const command = readFileSync(join(dir, "calls.jsonl"), "utf8");
	expect(command).toContain("Concurrency limit: 2");
	expect(command).toContain(dir);
	expect(command).toContain("https://github.com/example/code");
	expect(command).toContain("other-agent --prompt");
	expect(command).not.toContain("claude");
});

test("a manager restart uses the configured resume command in the same workspace", async () => {
	expect(
		(
			await configure({
				personaId: manager,
				concurrency: 2,
				directory: dir,
				agentCommand: "other-agent --name {{name}} {{prompt}}",
				agentResumeCommand: "other-agent resume --last {{prompt}}",
			})
		).status,
	).toBe(200);
	const first = await t.client.agentRuns.start({ personaId: manager, project: "RUN" });
	await t.client.agentRuns.stop({ id: first.id });
	const resumed = await t.client.agentRuns.start({ personaId: manager, project: "RUN" });
	expect(resumed).toMatchObject({ id: first.id, workspaceId: first.workspaceId, state: "running" });
	const calls = readFileSync(join(dir, "calls.jsonl"), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as string[]);
	const terminal = calls.find((args) => args[0] === "terminals" && args[1] === "create")!;
	const command = terminal[terminal.indexOf("--command") + 1]!;
	expect(command).toContain("other-agent resume --last");
	expect(command).toContain("Manage.");
	expect(command).not.toContain("claude");
});

test("agent commands reject blank values and unsupported variables", async () => {
	for (const field of ["agentCommand", "agentResumeCommand"]) {
		for (const value of [" ", "other-agent {{unknown}}", "other-agent {{agentCommand}}"])
			expect((await configure({ personaId: manager, concurrency: 2, directory: dir, [field]: value })).status).toBe(
				400,
			);
	}
});

test("the project rejects a non-manager persona and invalid configuration", async () => {
	for (const config of [
		{ personaId: builder, concurrency: 2, directory: dir },
		{ personaId: manager, concurrency: 0, directory: dir },
		{ personaId: manager, concurrency: 2, directory: "relative/path" },
	])
		expect((await configure(config)).status).toBe(400);
});

test("concurrency blocks a second ticket agent before launch and excludes the manager", async () => {
	expect((await configure({ personaId: manager, concurrency: 1, directory: dir })).status).toBe(200);
	await t.client.agentRuns.start({ personaId: manager, project: "RUN" });
	const one = (await t.createTicket({ project: "RUN", title: "One" })).identifier;
	const two = (await t.createTicket({ project: "RUN", title: "Two" })).identifier;
	const first = await t.client.agentRuns.start({ personaId: builder, ticket: one });
	const second = await t.api("/api/agent-runs", { method: "POST", body: { personaId: builder, ticket: two } });
	expect(second.status).toBe(409);
	expect(await t.client.agentRuns.list({})).toHaveLength(2);
	await t.client.agentRuns.stop({ id: first.id });
	expect((await t.client.agentRuns.start({ personaId: builder, ticket: two })).state).toBe("running");
});

test("a custom manager terminal starts in the configured directory", async () => {
	await configure({ personaId: manager, concurrency: 2, directory: dir });
	await t.client.settings.set({ ...(await t.client.settings.get()), agentLaunchCommand: "pwd; exec /bin/cat" });
	const run = await t.client.agentRuns.start({ personaId: manager, project: "RUN" });
	expect(run.state).toBe("running");
	let output = "";
	for (let poll = 0; poll < 40; poll++) {
		output = (await t.client.agentRuns.output({ id: run.id })).text.replaceAll("\n", "");
		if (output.includes(dir)) break;
		await Bun.sleep(25);
	}
	expect(output).toContain(dir);
	await t.client.agentRuns.stop({ id: run.id });
});

test("a missing manager directory fails before the terminal launches", async () => {
	await configure({ personaId: manager, concurrency: 2, directory: join(dir, "missing") });
	const run = await t.client.agentRuns.start({ personaId: manager, project: "RUN" });
	expect(run.state).toBe("failed");
	expect(run.error).toContain("missing");
});

test("a custom agent receives the literal prompt and Trellis environment in tmux", async () => {
	const instruction = "Keep 'quotes', `backticks`, and $(printf EXPANDED) literal.";
	await t.client.personas.update({ id: manager, name: "Manager", kind: "manager", instruction });
	expect(
		(
			await configure({
				personaId: manager,
				concurrency: 2,
				directory: dir,
				ade: "custom",
				adeCommand: "/bin/zsh -c {{agentCommand}}",
				agentCommand: '/usr/bin/printf \'%s\\n\' {{prompt}} "$TRELLIS_ACTOR" "$TRELLIS_URL"',
			})
		).status,
	).toBe(200);
	const run = await t.client.agentRuns.start({ personaId: manager, project: "RUN" });
	expect(run).toMatchObject({ state: "running", runtime: "tmux" });
	let output = "";
	for (let poll = 0; poll < 40; poll++) {
		output = (await t.client.agentRuns.output({ id: run.id })).text;
		if (output.includes(`agent:${run.id}`)) break;
		await Bun.sleep(25);
	}
	expect(output).toContain(instruction);
	expect(output).toContain(`agent:${run.id}`);
	expect(output).toContain("http://");
});
