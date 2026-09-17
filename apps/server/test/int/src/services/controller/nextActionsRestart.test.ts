import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import type { ManagerWait } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim } from "../../../../../src/services/controller/controller.ts";
import { handle } from "../../../../../src/services/controller/work.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
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

for (const kind of ["time", "dependency", "human_response"] as const) {
	test(`a saved ${kind} wait returns after the database closes and reopens`, async () => {
		const directory = join(freshHome(), "db");
		const first = await diskDb(directory);
		const saved = await first.db.transaction(async (tx) => {
			await seedActors(tx);
			const projectId = await seedRoot(tx, "DSK", {
				manager_config: { personaId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", directory: "/tmp/trellis-test" },
			});
			const statusId = await seedStatus(tx, {
				projectId,
				name: "Todo",
				category: "todo",
				position: 0,
				isDefault: true,
			});
			const ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
			await tx.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,runtime,terminal_id,session_id,created_at,updated_at)
			VALUES ('manager','Manager','Manager','manager','Manage',${projectId},'DSK','native','attempt','session',${NOW},${NOW})`);
			await tx.execute(sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,created_at,updated_at)
			VALUES ('source',${projectId},1,'sent',${JSON.stringify([{ ticketId }])}::jsonb,${NOW},${NOW},${NOW})`);
			const dependencyId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
			const doneId = await seedStatus(tx, { projectId, name: "Done", category: "done", position: 1 });
			await tx.execute(sql`INSERT INTO comments (id,ticket_id,body,actor_kind,actor_name,created_at,updated_at)
			VALUES ('question',${ticketId},'Which option?', 'agent','claude',${NOW},${NOW})`);
			const waitFor: ManagerWait =
				kind === "time"
					? { type: "time", at: secondsAfter(10).toISOString() }
					: kind === "dependency"
						? { type: "dependency", ticketId: dependencyId }
						: { type: "human_response", commentId: "question" };
			await handle({ actor: { kind: "human", name: "dana" }, now: NOW }, tx, {
				id: "source",
				generation: 1,
				outcomes: [{ ticketId, status: "queued", reason: "Assign Builder.", waitFor }],
			});
			await assertStatusInvariant(tx);
			return { ticketId, dependencyId, doneId, waitFor };
		});
		const original = (await first.db.execute(sql`SELECT assignment_request_id FROM manager_next_actions`)).rows[0]!;
		await first.close();
		const reopened = await diskDb(directory);
		closers.push(reopened.close);
		await reopened.db.transaction(async (tx) => {
			await collect({ now: secondsAfter(1) }, tx, { sessions: [controllerSession()] });
			expect(await claim({ now: secondsAfter(1) }, tx, { sessions: [controllerSession()] })).toBeNull();
			await tx.execute(
				sql`UPDATE tickets SET status_id=${saved.doneId},completed_at=${NOW} WHERE id=${saved.dependencyId}`,
			);
			await tx.execute(sql`INSERT INTO comments (id,ticket_id,parent_id,body,actor_kind,actor_name,created_at,updated_at)
			VALUES ('answer',${saved.ticketId},'question','Option one.','human','dana',${NOW},${NOW})`);
			await collect({ now: secondsAfter(10) }, tx, { sessions: [controllerSession()] });
			const delivery = await claim({ now: secondsAfter(10) }, tx, { sessions: [controllerSession()] });
			expect(delivery?.nextActions).toHaveLength(1);
			expect(delivery?.nextActions[0]).toMatchObject({
				ticketId: saved.ticketId,
				assignmentRequestId: original.assignment_request_id,
				wakeCondition: kind,
			});
			await assertStatusInvariant(tx);
		});
	});
}

test("a saved action with no wait returns as ready after the database closes and reopens", async () => {
	const directory = join(freshHome(), "db");
	const first = await diskDb(directory);
	await first.db.transaction(async (tx) => {
		await seedActors(tx);
		const projectId = await seedRoot(tx, "DSK", {
			manager_config: { personaId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", directory: "/tmp/trellis-test" },
		});
		const statusId = await seedStatus(tx, {
			projectId,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
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
	});
	await first.close();
	const reopened = await diskDb(directory);
	closers.push(reopened.close);
	await reopened.db.transaction(async (tx) => {
		await collect({ now: secondsAfter(1) }, tx, { sessions: [controllerSession()] });
		const delivery = await claim({ now: secondsAfter(1) }, tx, { sessions: [controllerSession()] });
		expect(delivery?.nextActions).toHaveLength(1);
		expect(delivery?.nextActions[0]).toMatchObject({ wakeCondition: "ready" });
		expect(delivery?.nextActions[0]?.waitFor ?? null).toBeNull();
		await assertStatusInvariant(tx);
	});
});
