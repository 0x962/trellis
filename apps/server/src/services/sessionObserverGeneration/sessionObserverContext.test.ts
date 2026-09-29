import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { getRun } from "../agentRuns/index.ts";
import { create as createEpic } from "../epics/epics.ts";
import { at, context, seed } from "../sessionObservers/testFixture";
import { readDependencyOutcomes } from "../tickets.ts";
import { readSessionObserverContext } from "./index.ts";

let fixture: Awaited<ReturnType<typeof seed>>;
const ctx = context([]);

beforeAll(async () => {
	fixture = await seed();
	await fixture.db.transaction((tx) => ctx.cache.rebuild(tx));
});

afterAll(async () => fixture.db.$client.close());

test("reads a standalone goal without project or ticket context", async () => {
	const result = await fixture.db.transaction((tx) =>
		readSessionObserverContext(ctx, tx, { runId: fixture.standaloneRunId }),
	);
	expect(result).toEqual({ goal: "Work.", project: null, ticket: null, epic: null });
});

test("reads relevant project context for a standalone session", async () => {
	await fixture.db.transaction(async (tx) => {
		const run = await getRun(tx, fixture.ticketRunId);
		await tx.execute(sql`UPDATE agent_runs SET project_id=${run.projectId} WHERE id=${fixture.standaloneRunId}`);
		const result = await readSessionObserverContext(ctx, tx, { runId: fixture.standaloneRunId });
		expect(result).toEqual({
			goal: "Work.",
			project: { key: "OBS", name: "Observers", description: "" },
			ticket: null,
			epic: null,
		});
	});
});

test("reads ticket requirements without an epic", async () => {
	const result = await fixture.db.transaction((tx) =>
		readSessionObserverContext(ctx, tx, { runId: fixture.ticketRunId }),
	);
	expect(result.ticket).toEqual({
		identifier: "OBS-1",
		title: "Observed ticket",
		description: "",
		contractResult: null,
	});
	expect(result.epic).toBeNull();
});

test("reads epic purpose and completed dependency outcomes without unrelated tickets", async () => {
	await fixture.db.transaction(async (tx) => {
		const run = await getRun(tx, fixture.ticketRunId);
		const { id: epicId } = await createEpic(ctx, tx, {
			project: run.projectId!,
			name: "Understand project progress",
			description: "Explain the project without the transcript.",
		});
		await tx.execute(sql`UPDATE tickets SET epic_id=${epicId} WHERE id=${run.ticketId}`);
		for (const [number, outcome] of [
			[2, "The saved account survives restart."],
			[3, ""],
			[4, "Unrelated work."],
		] as const) {
			const ticketId = ulid();
			await tx.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, outcome, position, created_at, updated_at)
				SELECT ${ticketId}, project_id, ${number}, 'Prerequisite', status_id, ${outcome}, ${number}, ${at}, ${at}
				FROM tickets WHERE id=${run.ticketId}`);
			if (number !== 4)
				await tx.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at)
					VALUES (${run.ticketId}, ${ticketId}, 'manual', ${at})`);
		}
		const priorOutcomes = [{ identifier: "OBS-2", outcome: "The saved account survives restart." }];
		expect(await readDependencyOutcomes(ctx, tx, { ticketId: run.ticketId! })).toEqual(priorOutcomes);
		const result = await readSessionObserverContext(ctx, tx, { runId: fixture.ticketRunId });
		expect(result.epic).toEqual({
			name: "Understand project progress",
			description: "Explain the project without the transcript.",
			priorOutcomes,
		});
	});
});
