import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import * as environment from "../../executionEnvironment/index.ts";
import { observeAttempt } from "../agentRuns/observeAttempt";
import { claimNext } from "./claimNext.ts";
import { readExecution } from "./queries.ts";
import { recordTaskObservation } from "./recordTaskObservation.ts";
import { testFixture } from "./testFixture";

let db: Awaited<ReturnType<typeof testFixture>>["db"];
let ctx: Awaited<ReturnType<typeof testFixture>>["ctx"];
let run: Awaited<ReturnType<typeof testFixture>>["run"];
let createExecution: Awaited<ReturnType<typeof testFixture>>["createExecution"];
const env = spyOn(environment, "executionEnvironment").mockResolvedValue({});
beforeAll(async () => {
	({ db, ctx, run, createExecution } = await testFixture());
}, 30_000);
afterAll(async () => {
	env.mockRestore();
	await db.$client.close();
});
const claimTask = async () => {
	const execution = await (await createExecution()).create();
	const claim = (await run((tx) => claimNext(ctx, tx, { id: execution.id })))!;
	return { id: execution.id, key: claim.key, attemptId: claim.attempt.id, runId: claim.run.id };
};
const observe = async (input: Omit<Parameters<typeof recordTaskObservation>[2], "attempt"> & { runId: string }) => {
	const attempt = await observeAttempt(
		{ newTx: run },
		{ runId: input.runId, attemptId: input.attemptId, sessionId: input.snapshot.sessionId },
	);
	return run((tx) => recordTaskObservation(ctx, tx, { ...input, attempt }));
};
const failedSnapshot = {
	state: "failed" as const,
	sessionId: "late-session",
	result: null,
	acknowledgedMessageIds: [],
	error: "Prompt exceeds 200000 characters",
};

for (const savedError of [null, failedSnapshot.error]) {
	test(`a late identity preserves a failure with saved error ${savedError}`, async () => {
		const task = await claimTask();
		await db.execute(sql`UPDATE agent_runs SET error=${savedError} WHERE id=${task.runId}`);
		await observe({
			...task,
			snapshot: { ...failedSnapshot, error: savedError === null ? failedSnapshot.error : "Later process exit" },
		});
		const execution = await run((tx) => readExecution(tx, task.id));
		expect(execution.state.status).toBe("failed");
		expect(execution.state.error).toContain(failedSnapshot.error);
		const saved = await db.execute(sql`SELECT session_id FROM agent_runs WHERE id=${task.runId}`);
		expect(saved.rows[0]!.session_id).toBe("late-session");
	});
}

test("an old task attempt cannot save a failure", async () => {
	const task = await claimTask();
	expect(await observe({ ...task, attemptId: "old-attempt", snapshot: failedSnapshot })).toBe(false);
	expect((await run((tx) => readExecution(tx, task.id))).state.status).toBe("running");
});

for (const mismatch of ["terminal_id", "session_id"] as const) {
	test(`a different ${mismatch} cannot supply a result`, async () => {
		const task = await claimTask();
		await db.execute(sql`UPDATE agent_runs SET ${sql.identifier(mismatch)}='other' WHERE id=${task.runId}`);
		await observe({ ...task, snapshot: failedSnapshot });
		const execution = await run((tx) => readExecution(tx, task.id));
		expect(execution.state.steps[0]!.state).toBe("unknown");
		expect(execution.state.steps[0]!.error).toContain("does not belong");
	});
}

test("a late identity still requires the assignment receipt before completion", async () => {
	const task = await claimTask();
	const snapshot = { ...failedSnapshot, state: "idle" as const, error: null, result: "Done", resultId: "result" };
	await observe({ ...task, snapshot });
	expect((await run((tx) => readExecution(tx, task.id))).state.steps[0]!.state).toBe("unknown");
	await observe({ ...task, snapshot: { ...snapshot, acknowledgedMessageIds: [task.attemptId] } });
	expect((await run((tx) => readExecution(tx, task.id))).state.status).toBe("succeeded");
});

test("a reassignment after observation cannot save the old result", async () => {
	const task = await claimTask();
	const attempt = await observeAttempt(
		{ newTx: run },
		{ runId: task.runId, attemptId: task.attemptId, sessionId: failedSnapshot.sessionId },
	);
	expect(attempt.matched).toBe(true);
	await db.execute(sql`UPDATE agent_runs SET terminal_id='next-attempt' WHERE id=${task.runId}`);
	await run((tx) => recordTaskObservation(ctx, tx, { ...task, attempt, snapshot: failedSnapshot }));
	expect((await run((tx) => readExecution(tx, task.id))).state.steps[0]!.error).toContain("does not belong");
});
