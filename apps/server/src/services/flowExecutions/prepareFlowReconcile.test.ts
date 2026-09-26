import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import * as environment from "../../executionEnvironment/index.ts";
import type { claimNext } from "./claimNext.ts";
import { prepareFlowReconcile } from "./prepareFlowReconcile.ts";
import { readExecution } from "./queries.ts";
import { testFixture } from "./testFixture";
import type { FlowCtx } from "./types.ts";

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

const promptError = "Prompt exceeds 200000 characters";
test("a new execution gets a task while an older launch waits, without duplicate starts", async () => {
	await db.execute(sql`UPDATE flow_executions SET state=jsonb_set(state,'{status}','"canceled"'::jsonb)`);
	await db.execute(sql`UPDATE agent_runs SET closed_at=${ctx.now}`);
	const older = await (await createExecution()).create();
	const blocked = Promise.withResolvers<void>();
	const entered = Promise.withResolvers<void>();
	const starts: string[] = [];
	const flowCtx = { core: ctx, home: "scheduler-test", newTx: run, now: () => ctx.now } as FlowCtx;
	const deps = {
		closeExited: async () => [],
		start: async (_ctx: FlowCtx, claim: NonNullable<Awaited<ReturnType<typeof claimNext>>>) => {
			starts.push(claim.id);
			if (claim.id === older.id) {
				entered.resolve();
				await blocked.promise;
			}
			return undefined;
		},
		observe: async () => null,
		stop: async () => {},
		warn: async () => {},
	};
	const first = prepareFlowReconcile(flowCtx, {}, deps);
	await entered.promise;
	try {
		const newer = await (await createExecution()).create();
		await prepareFlowReconcile(flowCtx, {}, deps);
		expect(starts).toEqual([older.id, newer.id]);
		const tasks = await db.execute(sql`SELECT key FROM flow_execution_tasks WHERE execution_id=${newer.id}`);
		expect(tasks.rows).toHaveLength(1);
	} finally {
		blocked.resolve();
		await first;
	}
});

test("a rejected pre-launch prompt saves the original flow error", async () => {
	await db.execute(sql`UPDATE flow_executions SET state=jsonb_set(state,'{status}','"canceled"'::jsonb)`);
	await db.execute(sql`UPDATE agent_runs SET closed_at=${ctx.now}`);
	const execution = await (await createExecution()).create();
	await prepareFlowReconcile(
		{ core: ctx, home: "launch-error-test", newTx: run, now: () => ctx.now } as FlowCtx,
		{},
		{
			closeExited: async () => [],
			start: async (_ctx, claim) => {
				await db.execute(sql`UPDATE agent_runs SET closed_at=${ctx.now},error=${promptError} WHERE id=${claim.run.id}`);
				throw new Error(promptError);
			},
			observe: async () => null,
			stop: async () => {},
			warn: async () => {},
		},
	);
	const saved = await run((tx) => readExecution(tx, execution.id));
	expect(saved.state.status).toBe("failed");
	expect(saved.state.error).toBe(promptError);
});
