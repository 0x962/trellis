import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let id: string;
beforeAll(async () => {
	t = await createTestApp();
	const project = await t.seedProject("RET");
	id = ulid();
	await t.serverTx((tx) =>
		tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,workspace_id,terminal_id,session_id,created_at,updated_at) VALUES (${id},'Wren','Manager','manager','Manage',${project.id},'RET','running','superset','workspace','terminal','conversation',now(),now())`,
		),
	);
});
afterEach(() => t.serverTx(assertStatusInvariant));
afterAll(() => t.close());
const input = () => ({
	source: "persona",
	id,
	runtime: "superset",
	workspaceId: "workspace",
	terminalId: "terminal",
	sessionId: "conversation",
	externalProcessStopped: true,
});
test("retirement API requires a human and explicit process confirmation", async () => {
	const rejected = await t.api("/api/agent-runs/retire-external", {
		method: "POST",
		body: input(),
		actor: "agent:worker",
	});
	expect(rejected.status).toBe(400);
	const unconfirmed = await t.api("/api/agent-runs/retire-external", {
		method: "POST",
		body: { ...input(), externalProcessStopped: false },
	});
	expect(unconfirmed.status).toBe(400);
});
test("retirement API returns its audit and retains the historical run", async () => {
	const result = await t.api("/api/agent-runs/retire-external", { method: "POST", body: input() });
	expect(result.status).toBe(200);
	expect(result.body).toMatchObject({ id, source: "persona", sessionId: "conversation", actorName: "dana" });
	const runs = await t.client.agentRuns.list({ project: "RET" });
	expect(runs[0]).toMatchObject({
		id,
		state: "failed",
		workspaceId: "workspace",
		terminalId: "terminal",
		sessionId: "conversation",
	});
});

test("a delayed launch URL error cannot revive a retired external assignment", async () => {
	const dir = await mkdtemp(join(tmpdir(), "trellis-retire-launch-"));
	const bin = join(dir, "superset.ts");
	const source = await readFile(new URL("../../../../../../test/agent-runs/superset.ts", import.meta.url), "utf8");
	await writeFile(
		bin,
		source.replace(
			"const args = process.argv.slice(2);",
			'const args = process.argv.slice(2); if (args[1] === "open") { await Bun.write(new URL("./queried", import.meta.url), "ready"); await Bun.sleep(300); process.stderr.write("URL unavailable"); process.exit(1); }',
		),
	);
	await chmod(bin, 0o755);
	const app = await createTestApp({ supersetBin: bin });
	try {
		await app.seedProject("URL");
		await app.client.projects.setRepos({ project: "URL", repos: [{ owner: "example", repo: "code" }] });
		const persona = await app.client.personas.create({ name: "Manager", kind: "manager", instruction: "Manage" });
		const pending = app.client.agentRuns.start({ project: "URL", personaId: persona.id });
		while (!(await Bun.file(join(dir, "queried")).exists())) await Bun.sleep(10);
		const [run] = await app.client.agentRuns.list({ project: "URL" });
		await app.client.agentRuns.retireExternal({
			source: "persona",
			id: run!.id,
			runtime: "superset",
			workspaceId: run!.workspaceId,
			terminalId: run!.terminalId,
			sessionId: run!.sessionId,
			externalProcessStopped: true,
		});
		await pending;
		expect((await app.client.agentRuns.list({ project: "URL" }))[0]).toMatchObject({
			state: "failed",
			error: expect.stringContaining("retired"),
		});
		await app.serverTx(assertStatusInvariant);
	} finally {
		await app.close();
		await rm(dir, { recursive: true });
	}
});
