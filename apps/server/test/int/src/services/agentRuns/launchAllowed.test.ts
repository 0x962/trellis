import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { launchAllowed } from "../../../../../src/services/agentRuns/launchAllowed.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
let ticket: string;
let status: string;
const config = { personaId: "builder", harness: HarnessSchema.parse({ preset: "claude" }), accountId: null };
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		project = await seedRoot(tx, "FENCE");
		status = (await seedStatuses(tx, project)).started;
		await tx.execute(sql`UPDATE statuses SET agent_config=${JSON.stringify(config)}::jsonb WHERE id=${status}`);
		ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,persona_name,runtime,kind,instruction,project_id,project_path,ticket_id,terminal_id,created_at,updated_at) VALUES ('worker','Worker','Worker','native','builder','Work',${project},'FENCE',${ticket},'attempt',now(),now())`,
		);
		await tx.execute(sql`INSERT INTO column_workers(ticket_id,status_id,run_id) VALUES (${ticket},${status},'worker')`);
	});
});
const allowed = () =>
	h.read((tx) =>
		launchAllowed(tx, {
			runId: "worker",
			terminalId: "attempt",
			requiredStatusId: status,
			requiredAgentConfig: config,
		}),
	);
test("a current column assignment can launch", async () => {
	expect(await allowed()).toBe(true);
});
test.each(["retired", "settings", "archived", "replaced"])("a %s assignment cannot launch", async (reason) => {
	if (reason === "retired") await h.rows(sql`UPDATE column_workers SET retired=true`);
	if (reason === "settings") await h.rows(sql`UPDATE statuses SET agent_config=NULL WHERE id=${status}`);
	if (reason === "archived") await h.rows(sql`UPDATE projects SET archived_at=now() WHERE id=${project}`);
	if (reason === "replaced") await h.rows(sql`UPDATE agent_runs SET terminal_id='replacement' WHERE id='worker'`);
	expect(await allowed()).toBe(false);
});
