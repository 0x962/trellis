import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim } from "../../../../../src/services/controller/controller.ts";
import { handle } from "../../../../../src/services/controller/work.ts";
import { seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { diskDb } from "../../../../helpers/db.ts";
import { freshHome } from "../../../../helpers/home.ts";
import { NOW, secondsAfter } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

const closers: Array<() => Promise<void>> = [];
afterAll(async () => {
	for (const close of closers) await close();
});

test("a saved capacity wait returns after the database closes and reopens", async () => {
	const directory = join(freshHome(), "db");
	const first = await diskDb(directory);
	const ticketId = await first.db.transaction(async (tx) => {
		const projectId = await seedRoot(tx, "DSK", {
			manager_config: { personaId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", concurrency: 1, directory: "/tmp/trellis-test" },
		});
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		const ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,runtime,terminal_id,session_id,created_at,updated_at)
			VALUES ('manager','Manager','Manager','manager','Manage',${projectId},'DSK','native','attempt','session',${NOW},${NOW})`);
		await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
			VALUES ('source',${projectId},1,'sent',${JSON.stringify([{ ticketId }])}::jsonb,${NOW},${NOW},${NOW})`);
		await handle({ actor: { kind: "human", name: "dana" }, now: NOW }, tx, {
			id: "source",
			generation: 1,
			outcomes: [{ ticketId, status: "queued", reason: "Assign Builder." }],
		});
		await assertStatusInvariant(tx);
		return ticketId;
	});
	const original = (await first.db.execute(sql`SELECT assignment_request_id FROM manager_next_actions`)).rows[0]!;
	await first.close();
	const reopened = await diskDb(directory);
	closers.push(reopened.close);
	await reopened.db.transaction(async (tx) => {
		await collect({ now: secondsAfter(1) }, tx, { sessions: [controllerSession()] });
		const delivery = await claim({ now: secondsAfter(1) }, tx, { sessions: [controllerSession()] });
		expect(delivery?.nextActions).toHaveLength(1);
		expect(delivery?.nextActions[0]).toMatchObject({ ticketId, assignmentRequestId: original.assignment_request_id });
		await assertStatusInvariant(tx);
	});
});
