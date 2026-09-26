import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { node } from "../../agents/nativeFlow/testDoc.ts";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import * as environment from "../../executionEnvironment/index.ts";
import { create as createFlow } from "../flows/flows.ts";
import { save as saveFlow } from "../flows/save.ts";
import { ensurePr } from "../reviews/queries.ts";
import { create as createTicket } from "../tickets/create.ts";
import { claimNext } from "./claimNext.ts";
import { prepareFlowReconcile } from "./prepareFlowReconcile.ts";
import { readExecution } from "./queries.ts";
import { recordTaskObservation } from "./recordTaskObservation.ts";
import { start } from "./start.ts";
import type { FlowCtx } from "./types.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const oneId = ulid();
const twoId = ulid();
const at = "2026-09-22T10:00:00Z";
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const addProject = async (id: string, key: string, slug: string) => {
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${slug}, ${slug}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${id}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
};

const env = spyOn(environment, "executionEnvironment").mockResolvedValue({});

beforeAll(async () => {
	db = await openTestDb();
	await addProject(oneId, "ONE", "one");
	await addProject(twoId, "TWO", "two");
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "agent", name: "Test" },
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => {
	env.mockRestore();
	await db.$client.close();
});

test("a flow of another project cannot run on this ticket", async () => {
	const flow = await run((tx) => createFlow(ctx, tx, { name: "Two review", project: "TWO" }));
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "ONE", title: "Work in project one" }));

	await expect(
		run((tx) =>
			start(ctx, tx, {
				flow: flow.slug,
				ticket: ticket.identifier,
				requestId: crypto.randomUUID(),
				expectedVersion: flow.version,
			}),
		),
	).rejects.toThrow("The flow belongs to another project.");
});

const fixture = async () => {
	const flow = await run((tx) => createFlow(ctx, tx, { name: `Review ${ulid()}`, project: "ONE" }));
	const doc = await run((tx) =>
		saveFlow(ctx, tx, {
			flow: flow.id,
			expectedVersion: flow.version,
			nodes: [node(ulid(), "agent", null)],
			edges: [],
		}),
	);
	const ticket = await run((tx) => createTicket(ctx, tx, { project: "ONE", title: "Review this change" }));
	const diff = await run((tx) => ensurePr(tx, `example/app#${ticket.number}`));
	await db.execute(
		sql`INSERT INTO ticket_pull_requests (ticket_id,pull_request_id,source,actor_name,actor_kind,created_at) VALUES (${ticket.id},${diff.id},'manual','Test','agent',${at})`,
	);
	const input = {
		flow: flow.id,
		ticket: ticket.id,
		diffId: diff.id,
		headSha: "first",
		expectedVersion: doc.flow.version,
	};
	const create = (actor = "Test") =>
		run((tx) =>
			start({ ...ctx, actor: { kind: "agent", name: actor } }, tx, { ...input, requestId: crypto.randomUUID() }),
		);
	return { input, create };
};

test("concurrent agents receive one run for the same flow and diff", async () => {
	const { create } = await fixture();
	const [first, second] = await Promise.all([create(), create("Peer")]);
	expect(first.id).toBe(second.id);
});

test("only the latest execution error permits another automatic start", async () => {
	const { create } = await fixture();
	const first = await create();
	await db.execute(
		sql`UPDATE flow_executions SET state=${JSON.stringify({ ...first.state, status: "failed", failureKind: "error", error: "Provider exited" })}::jsonb WHERE id=${first.id}`,
	);
	const retry = await create();
	expect(retry.id).not.toBe(first.id);
	expect(retry.repeatOf).toBe(first.id);
	expect((await create()).id).toBe(retry.id);
});

for (const status of ["succeeded", "waiting", "canceled", "failed"] as const) {
	test(`${status} with feedback does not create another run after a push`, async () => {
		const { input, create } = await fixture();
		const first = await create();
		await db.execute(
			sql`UPDATE flow_executions SET state=${JSON.stringify({ ...first.state, status, ...(status === "failed" ? { failureKind: "feedback" } : {}), steps: first.state.steps.map((step) => ({ ...step, output: "Changes requested: fix the bug." })) })}::jsonb WHERE id=${first.id}`,
		);
		const again = await run((tx) => start(ctx, tx, { ...input, headSha: "second", requestId: crypto.randomUUID() }));
		expect(again.id).toBe(first.id);
	});
}

test("an explicit repeat records the user's reason and preserves request idempotency", async () => {
	const { input, create } = await fixture();
	const first = await create();
	const request = {
		...input,
		allowRepeat: true,
		repeatReason: "The user requested another review.",
		requestId: crypto.randomUUID(),
	};
	const repeated = await run((tx) => start(ctx, tx, request));
	expect(repeated.id).not.toBe(first.id);
	expect(repeated.repeatReason).toBe(request.repeatReason);
	expect((await run((tx) => start(ctx, tx, request))).id).toBe(repeated.id);
});

const claimed = async () => {
	const execution = await (await fixture()).create();
	const claim = (await run((tx) => claimNext(ctx, tx, { id: execution.id })))!;
	return { id: execution.id, key: claim.key, attemptId: claim.attempt.id, runId: claim.run.id };
};
const failure = {
	state: "failed" as const,
	sessionId: "late-session",
	result: null,
	acknowledgedMessageIds: [],
	error: "Prompt exceeds 200000 characters",
};

for (const savedError of [null, failure.error]) {
	test(`a late identity preserves a failure with saved error ${savedError}`, async () => {
		const task = await claimed();
		await db.execute(sql`UPDATE agent_runs SET error=${savedError} WHERE id=${task.runId}`);
		await run((tx) =>
			recordTaskObservation(ctx, tx, {
				...task,
				snapshot: { ...failure, error: savedError === null ? failure.error : "Later process exit" },
			}),
		);
		const execution = await run((tx) => readExecution(tx, task.id));
		expect(execution.state.status).toBe("failed");
		expect(execution.state.error).toContain(failure.error);
		const saved = await db.execute(sql`SELECT session_id FROM agent_runs WHERE id=${task.runId}`);
		expect(saved.rows[0]!.session_id).toBe("late-session");
	});
}

test("an old task attempt cannot save a failure", async () => {
	const task = await claimed();
	expect(
		await run((tx) => recordTaskObservation(ctx, tx, { ...task, attemptId: "old-attempt", snapshot: failure })),
	).toBe(false);
	expect((await run((tx) => readExecution(tx, task.id))).state.status).toBe("running");
});

for (const mismatch of ["terminal_id", "session_id"] as const) {
	test(`a different ${mismatch} cannot supply a result`, async () => {
		const task = await claimed();
		await db.execute(sql`UPDATE agent_runs SET ${sql.identifier(mismatch)}='other' WHERE id=${task.runId}`);
		await run((tx) => recordTaskObservation(ctx, tx, { ...task, snapshot: failure }));
		const execution = await run((tx) => readExecution(tx, task.id));
		expect(execution.state.steps[0]!.state).toBe("unknown");
		expect(execution.state.steps[0]!.error).toContain("does not belong");
	});
}

test("a late identity still requires the assignment receipt before completion", async () => {
	const task = await claimed();
	const snapshot = { ...failure, state: "idle" as const, error: null, result: "Done", resultId: "result" };
	await run((tx) => recordTaskObservation(ctx, tx, { ...task, snapshot }));
	expect((await run((tx) => readExecution(tx, task.id))).state.steps[0]!.state).toBe("unknown");
	await run((tx) =>
		recordTaskObservation(ctx, tx, { ...task, snapshot: { ...snapshot, acknowledgedMessageIds: [task.attemptId] } }),
	);
	expect((await run((tx) => readExecution(tx, task.id))).state.status).toBe("succeeded");
});

test("a new execution gets a task while an older launch waits, without duplicate starts", async () => {
	await db.execute(sql`UPDATE flow_executions SET state=jsonb_set(state,'{status}','"canceled"'::jsonb)`);
	await db.execute(sql`UPDATE agent_runs SET closed_at=${ctx.now}`);
	const older = await (await fixture()).create();
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
		const newer = await (await fixture()).create();
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
	const execution = await (await fixture()).create();
	await prepareFlowReconcile(
		{ core: ctx, home: "launch-error-test", newTx: run, now: () => ctx.now } as FlowCtx,
		{},
		{
			closeExited: async () => [],
			start: async (_ctx, claim) => {
				await db.execute(
					sql`UPDATE agent_runs SET closed_at=${ctx.now},error=${failure.error} WHERE id=${claim.run.id}`,
				);
				throw new Error(failure.error);
			},
			observe: async () => null,
			stop: async () => {},
			warn: async () => {},
		},
	);
	const saved = await run((tx) => readExecution(tx, execution.id));
	expect(saved.state.status).toBe("failed");
	expect(saved.state.error).toBe(failure.error);
});
