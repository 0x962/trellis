import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTestDb, openTestDbFromArchive } from "../../testDb";
import { rows } from "../support";
import { oracle } from "./fixtures/oracle";
import { type CandidateCase, seed } from "./fixtures/seed";
import { flowReconcileCandidates } from "./flowReconcileCandidates";

let db: Awaited<ReturnType<typeof openTestDb>>;
const cases: CandidateCase[] = [];
const stops = [undefined, false, true, "true", "false", null, [true], { needsStop: true }];
for (const status of ["running", "waiting", "succeeded", "failed", "canceled"]) {
	for (const [i, needsStop] of stops.entries()) {
		for (const [j, tasks] of [
			[],
			[{ open: true, result: false }],
			[{ open: true, result: true }],
			[{ open: false, result: false }],
			[{ open: false, result: true }],
			[
				{ open: true, result: true },
				{ open: true, result: true },
			],
		].entries()) {
			cases.push({ id: `${status}-${i}-${j}`, status, steps: [{}, { needsStop }], tasks });
		}
	}
}

beforeAll(async () => {
	db = await openTestDb();
	await db.transaction((tx) => seed(tx, { history: 0, cases }));
}, 30_000);
afterAll(async () => db.$client.close());

const read = () => db.transaction(flowReconcileCandidates);
const compare = async () => {
	const expected = await db.transaction((tx) => rows<{ id: string }>(tx, oracle));
	const actual = await read();
	expect(actual).toEqual(expected);
	return actual.map(({ id }) => id);
};

test("preserves every ordered candidate across statuses, stop values, and task assignments", async () => {
	const expected = cases
		.filter(
			(c) =>
				c.status === "running" ||
				c.status === "waiting" ||
				c.steps.some((s) => [true, "true"].includes((s as { needsStop: boolean }).needsStop)) ||
				c.tasks.some((t) => t.open && (t.result || c.status === "failed")),
		)
		.map((c) => c.id)
		.sort();
	expect(await compare()).toEqual(expected);
});

test("orders by creation time before the execution ID", async () => {
	await db.execute(sql`UPDATE flow_executions SET created_at='2026-08-01' WHERE id='waiting-0-0'`);
	await db.execute(sql`UPDATE flow_executions SET created_at='2026-10-01' WHERE id='failed-2-0'`);
	const found = await compare();
	expect(found[0]).toBe("waiting-0-0");
	expect(found.at(-1)).toBe("failed-2-0");
});

test("reflects committed stops, task settlement, and assignment closure", async () => {
	await db.execute(sql`UPDATE flow_executions SET state=jsonb_set(state,'{steps,1,needsStop}','true')
		WHERE id='canceled-1-1'`);
	expect(await compare()).toContain("canceled-1-1");
	await db.execute(sql`UPDATE flow_executions SET state=jsonb_set(state,'{steps,1,needsStop}','false')
		WHERE id='canceled-1-1'`);
	expect(await compare()).not.toContain("canceled-1-1");
	await db.execute(sql`UPDATE flow_execution_tasks SET result_id='settled' WHERE execution_id='canceled-1-1'`);
	expect(await compare()).toContain("canceled-1-1");
	await db.execute(sql`UPDATE agent_runs SET closed_at=now() WHERE id='canceled-1-1-0'`);
	expect(await compare()).not.toContain("canceled-1-1");
});

test("keeps rollback invisible to the next selector", async () => {
	const before = await read();
	await expect(
		db.transaction(async (tx) => {
			await tx.execute(sql`UPDATE agent_runs SET closed_at=now()`);
			await tx.execute(sql`UPDATE flow_executions SET state='{"status":"succeeded","steps":[]}'`);
			expect(await flowReconcileCandidates(tx)).toEqual([]);
			throw new Error("rollback");
		}),
	).rejects.toThrow("rollback");
	expect(await read()).toEqual(before);
});

test("recovers the same candidates from the persisted database after restart", async () => {
	const before = await read();
	const archive = await db.$client.dumpDataDir("none");
	await db.$client.close();
	db = await openTestDbFromArchive(archive);
	expect(await read()).toEqual(before);
	await compare();
});
