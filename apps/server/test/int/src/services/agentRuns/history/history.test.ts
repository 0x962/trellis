import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { prepareOutput } from "../../../../../../src/services/agentRuns/communication.ts";
import type { ServiceCtx } from "../../../../../../src/services/support.ts";
import { seedRoot, seedStatus } from "../../../../../fixtures/projects.ts";
import { type Harness, serviceHarness } from "../../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../../invariants.ts";

let h: Harness;
let home: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
	await h.reset();
	home = await mkdtemp(join(tmpdir(), "trellis-history-"));
	const project = await h.read((tx) => seedRoot(tx, "HIS"));
	await h.read(async (tx) => {
		await seedStatus(tx, { projectId: project, name: "Todo", category: "todo", position: 0, isDefault: true });
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,closed_at,runtime,workspace_id,terminal_id,session_id,created_at,updated_at) VALUES ('history','Wren','Manager','manager','Manage',${project},'HIS',now(),'superset','old-workspace','old-terminal','old-session',now(),now())`,
		);
	});
});
afterEach(async () => {
	await h.read(assertStatusInvariant);
	await rm(home, { recursive: true });
});
const output = () => prepareOutput({ home, newTx: h.read } as unknown as ServiceCtx, { id: "history" });
test("saved conversation output stays readable from historical records", async () => {
	await mkdir(join(home, "agents", "history"), { recursive: true });
	await writeFile(join(home, "agents", "history", "output.txt"), "The saved agent result.");
	const result = await output();
	expect(result.text).toContain("Historical terminal capture");
	expect(result.text).toContain("The saved agent result.");
	expect(result.text).toContain("old-workspace");
	expect(
		await h.one(
			sql`SELECT closed_at IS NOT NULL AS closed,workspace_id,terminal_id,session_id FROM agent_runs WHERE id='history'`,
		),
	).toMatchObject({
		closed: true,
		workspace_id: "old-workspace",
		terminal_id: "old-terminal",
		session_id: "old-session",
	});
});
test("a historical record without captured output reports the missing capture", async () => {
	expect((await output()).text).toContain("No retained terminal capture");
});
