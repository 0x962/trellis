import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { saveAde } from "../../../../../../src/agents/commandAde/commandAde.ts";
import { prepareOutput } from "../../../../../../src/services/agentRuns/communication.ts";
import { retireExternal } from "../../../../../../src/services/agentRuns/externalRetirement/externalRetirement.ts";
import { prepareRefresh } from "../../../../../../src/services/agentRuns/lifecycle.ts";
import type { ServiceCtx } from "../../../../../../src/services/support.ts";
import { seedRoot, seedStatus } from "../../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let home: string;
let bin: string;
let ctx: ServiceCtx & { supersetBin: string };
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await rm(home, { recursive: true });
});
beforeEach(async () => {
	await h.reset();
	home = await mkdtemp(join(tmpdir(), "trellis-external-unavailable-"));
	bin = join(home, "superset");
	await writeFile(bin, '#!/usr/bin/env bun\nprocess.stderr.write("Workspace not found on host");process.exit(1);\n');
	await chmod(bin, 0o755);
	const project = await h.read((tx) => seedRoot(tx, "OLD"));
	await h.read(async (tx) => {
		await seedStatus(tx, { projectId: project, name: "Todo", category: "todo", position: 0, isDefault: true });
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,state,runtime,workspace_id,terminal_id,session_id,created_at,updated_at) VALUES ('old','Wren','Manager','manager','Manage',${project},'OLD','running','superset','workspace','terminal','session',now(),now())`,
		);
	});
	ctx = { home, supersetBin: bin, newTx: h.read, now: () => new Date(), emit: () => {} } as unknown as typeof ctx;
});
test("a missing workspace becomes interrupted and retains its exact assignment", async () => {
	await prepareRefresh(ctx, { id: "old" });
	expect(
		await h.one(sql`SELECT state,error,workspace_id,terminal_id,session_id FROM agent_runs WHERE id='old'`),
	).toMatchObject({
		state: "interrupted",
		error: expect.stringContaining("unavailable"),
		workspace_id: "workspace",
		terminal_id: "terminal",
		session_id: "session",
	});
	await expect(prepareRefresh(ctx, { id: "old" })).resolves.toEqual({ id: "old" });
	expect((await h.one(sql`SELECT state FROM agent_runs WHERE id='old'`)).state).toBe("interrupted");
});
test("a missing terminal in a successful workspace response is unavailable, not an observed exit", async () => {
	await writeFile(bin, "#!/usr/bin/env bun\nconsole.log(JSON.stringify({sessions:[]}));\n");
	await prepareRefresh(ctx, { id: "old" });
	expect((await h.one(sql`SELECT state FROM agent_runs WHERE id='old'`)).state).toBe("interrupted");
});
test("unavailable output reads the retained capture and labels its historical provenance", async () => {
	await prepareRefresh(ctx, { id: "old" });
	await mkdir(join(home, "agents", "old"), { recursive: true });
	await writeFile(join(home, "agents", "old", "output.txt"), "Historical agent result");
	const output = await prepareOutput(ctx, { id: "old" });
	expect(output.text).toContain("Historical agent result");
	expect(output.text).toContain("Historical terminal capture");
	expect(output.text).toContain("workspace");
});
test("unavailable output without a capture names the missing assignment", async () => {
	await prepareRefresh(ctx, { id: "old" });
	const output = await prepareOutput(ctx, { id: "old" });
	expect(output.text).toContain("No retained terminal capture");
	expect(output.text).toContain("terminal");
});

test("retired output remains readable after the project switches runtime", async () => {
	await h.run((core, tx) =>
		retireExternal(core, tx, {
			source: "persona",
			id: "old",
			runtime: "superset",
			workspaceId: "workspace",
			terminalId: "terminal",
			sessionId: "session",
			externalProcessStopped: true,
		}),
	);
	await h.read((tx) =>
		tx.execute(
			sql`UPDATE projects SET manager_config='{"personaId":null,"concurrency":3,"directory":"/tmp/native","ade":"native"}'::jsonb`,
		),
	);
	await mkdir(join(home, "agents", "old"), { recursive: true });
	await writeFile(join(home, "agents", "old", "output.txt"), "Preserved result");
	await rm(bin);
	expect((await prepareOutput(ctx, { id: "old" })).text).toContain("Preserved result");
});
test("a delayed refresh cannot overwrite a retired assignment", async () => {
	await writeFile(
		bin,
		'#!/usr/bin/env bun\nawait Bun.write(new URL("./queried", import.meta.url), "ready");await Bun.sleep(300);console.log(JSON.stringify({sessions:[{terminalId:"terminal",exited:false}]}));\n',
	);
	const pending = prepareRefresh(ctx, { id: "old" });
	while (!(await Bun.file(join(home, "queried")).exists())) await Bun.sleep(10);
	await h.run((core, tx) =>
		retireExternal(core, tx, {
			source: "persona",
			id: "old",
			runtime: "superset",
			workspaceId: "workspace",
			terminalId: "terminal",
			sessionId: "session",
			externalProcessStopped: true,
		}),
	);
	await pending;
	expect((await h.one(sql`SELECT state FROM agent_runs WHERE id='old'`)).state).toBe("failed");
});

test("a delayed command healthcheck cannot revive a retired assignment", async () => {
	await h.read((tx) => tx.execute(sql`UPDATE agent_runs SET runtime='commands' WHERE id='old'`));
	await saveAde(home, "old", {
		commands: {
			start: "true",
			resume: "true",
			recover: "true",
			projects: "true",
			send: "true",
			output: "true",
			stop: "true",
			open: "true",
			healthcheck: `touch queried; sleep 0.3; printf '%s' '{"state":"running"}'`,
		},
		values: { runDir: home, trellisUrl: "http://localhost", actor: "agent:fixture" },
		agentCommand: "true",
	});
	const pending = prepareRefresh(ctx, { id: "old" });
	while (!(await Bun.file(join(home, "queried")).exists())) await Bun.sleep(10);
	await h.run((core, tx) =>
		retireExternal(core, tx, {
			source: "persona",
			id: "old",
			runtime: "commands",
			workspaceId: "workspace",
			terminalId: "terminal",
			sessionId: "session",
			externalProcessStopped: true,
		}),
	);
	await pending;
	expect((await h.one(sql`SELECT state FROM agent_runs WHERE id='old'`)).state).toBe("failed");
});
