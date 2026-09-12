import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
	};
	const saved = await configure(config);
	expect(saved.status).toBe(200);
	expect(saved.body.managerConfig).toEqual(config);
	expect((await t.client.projects.get({ project: "RUN" })).managerConfig).toEqual(config);
	await t.client.agentRuns.start({ personaId: manager, project: "RUN" });
	const command = readFileSync(join(dir, "calls.jsonl"), "utf8");
	expect(command).toContain("Concurrency limit: 2");
	expect(command).toContain(dir);
	expect(command).toContain("https://github.com/example/code");
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
