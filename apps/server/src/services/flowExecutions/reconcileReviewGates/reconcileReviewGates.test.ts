import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { advanceFlow } from "../../../agents/nativeFlow/advanceFlow.ts";
import { edge, node } from "../../../agents/nativeFlow/testDoc.ts";
import { save as saveFlow } from "../../flows/save.ts";
import { claimNext } from "../claimNext.ts";
import { readExecution } from "../queries.ts";
import { saveState } from "../saveState.ts";
import { testFixture } from "../testFixture";
import type { FlowCtx } from "../types.ts";
import { reconcileReviewGates } from "./reconcileReviewGates.ts";

let h: Awaited<ReturnType<typeof testFixture>>;
beforeAll(async () => {
	h = await testFixture();
}, 30_000);
afterAll(async () => {
	await h.db.$client.close();
});
const fixture = async () => {
	const setup = await h.createExecution();
	const front = { ...node(ulid(), "gate", null), reviewArea: "frontend" as const, instruction: "" };
	const back = { ...node(ulid(), "gate", null), reviewArea: "backend" as const, instruction: "" };
	const frontReview = node(ulid(), "agent", null);
	const backReview = node(ulid(), "agent", null);
	const doc = await h.run((tx) =>
		saveFlow(h.ctx, tx, {
			flow: setup.input.flow,
			nodes: [front, back, frontReview, backReview],
			edges: [edge(front.id, frontReview.id, "yes"), edge(back.id, backReview.id, "yes")].map((e) => ({
				...e,
				id: ulid(),
			})),
		}),
	);
	setup.input.expectedVersion = doc.flow.version;
	const execution = await setup.create();
	const ctx = { core: h.ctx, home: "review-gate-test", newTx: h.run, now: () => h.ctx.now } as FlowCtx;
	return { ctx, execution, front, back, frontReview, backReview };
};

for (const [frontend, backend] of [
	[true, false],
	[false, true],
	[true, true],
	[false, false],
])
	test(`routes frontend=${frontend} backend=${backend} from one Jev result`, async () => {
		const f = await fixture();
		let evaluations = 0;
		const paths = Array.from({ length: 230 }, (_, i) => `src/File${i}.ts`);
		await reconcileReviewGates(f.ctx, f.execution.id, {
			paths: async (pull) => {
				expect(pull.headSha).toBe("first");
				return paths;
			},
			evaluate: async (_ctx, input) => {
				expect(input).toEqual(paths);
				evaluations++;
				return { frontend: frontend!, backend: backend! };
			},
		});
		const saved = await h.run((tx) => readExecution(tx, f.execution.id));
		expect(evaluations).toBe(1);
		for (const [review, selected] of [
			[f.frontReview, frontend],
			[f.backReview, backend],
		] as const)
			expect(saved.state.steps.find((step) => step.nodeId === review.id)?.state).toBe(selected ? "ready" : "skipped");
		expect(
			(await h.db.execute(sql`SELECT * FROM flow_execution_tasks WHERE execution_id=${f.execution.id}`)).rows,
		).toHaveLength(0);
	});

test("a failed Jev request records a gate execution error", async () => {
	const f = await fixture();
	await reconcileReviewGates(f.ctx, f.execution.id, {
		paths: async () => ["server/order.py"],
		evaluate: async () => {
			throw new Error("HTTP 503");
		},
	});
	const saved = await h.run((tx) => readExecution(tx, f.execution.id));
	expect(saved.state.status).toBe("failed");
	expect(saved.state.failureKind).toBe("error");
	expect(saved.state.error).toBe("Jev gate: HTTP 503");
	expect(saved.state.steps.some((step) => step.needsStop)).toBe(false);
});

test("an interrupted request fails without another Jev call", async () => {
	const f = await fixture();
	const state = structuredClone(f.execution.state);
	state.steps.find((step) => step.nodeId === f.front.id)!.state = "running";
	await h.db.execute(sql`UPDATE flow_executions SET state=${JSON.stringify(state)}::jsonb WHERE id=${f.execution.id}`);
	await reconcileReviewGates(f.ctx, f.execution.id, {
		paths: async () => {
			throw new Error("must not fetch");
		},
		evaluate: async () => {
			throw new Error("must not evaluate");
		},
	});
	const saved = await h.run((tx) => readExecution(tx, f.execution.id));
	expect(saved.state.status).toBe("failed");
	expect(saved.state.error).toContain("interrupted");
});

test("Jev gates never reserve agent attempts", async () => {
	const f = await fixture();
	expect(await h.run((tx) => claimNext(h.ctx, tx, { id: f.execution.id }))).toBeNull();
});

test("a late Jev answer cannot undo a cancellation", async () => {
	const f = await fixture();
	const entered = Promise.withResolvers<void>();
	const answer = Promise.withResolvers<{ frontend: boolean; backend: boolean }>();
	const work = reconcileReviewGates(f.ctx, f.execution.id, {
		paths: async () => ["src/a.tsx"],
		evaluate: async () => {
			entered.resolve();
			return answer.promise;
		},
	});
	await entered.promise;
	await h.run(async (tx) => {
		const execution = await readExecution(tx, f.execution.id, true);
		await saveState(
			h.ctx,
			tx,
			execution,
			advanceFlow(
				execution.doc,
				execution.state,
				{ type: "cancel", reason: "Canceled by the user" },
				h.ctx.now.getTime(),
			),
		);
	});
	answer.resolve({ frontend: true, backend: true });
	await work;
	const saved = await h.run((tx) => readExecution(tx, f.execution.id));
	expect(saved.state.status).toBe("canceled");
	expect(saved.state.reviewRelevance).toBeUndefined();
	expect(saved.state.steps.some((step) => step.needsStop)).toBe(false);
});

test("the Review migration keeps unrelated gates, edges, and execution snapshots", async () => {
	const f = await fixture();
	await h.db.execute(sql`UPDATE flows SET slug='review' WHERE id=${f.execution.flowId}`);
	await h.db.execute(
		sql`UPDATE flow_nodes SET review_area=NULL, harness='{"preset":"codex"}'::jsonb,title=CASE WHEN id=${f.front.id} THEN 'Frontend relevant?' ELSE 'Backend relevant?' END WHERE id IN (${f.front.id},${f.back.id})`,
	);
	const before = await h.run((tx) => readExecution(tx, f.execution.id));
	const script = await Bun.file(new URL("../../../../drizzle/0127_petite_zombie.sql", import.meta.url)).text();
	await h.db.execute(sql.raw(script.split("--> statement-breakpoint")[2]!));
	const gates = await h.db.execute(
		sql`SELECT review_area,harness FROM flow_nodes WHERE id IN (${f.front.id},${f.back.id}) ORDER BY review_area`,
	);
	expect(gates.rows).toEqual([
		{ review_area: "backend", harness: null },
		{ review_area: "frontend", harness: null },
	]);
	expect((await h.db.execute(sql`SELECT * FROM flow_edges WHERE flow_id=${f.execution.flowId}`)).rows).toHaveLength(2);
	expect((await h.run((tx) => readExecution(tx, f.execution.id))).doc).toEqual(before.doc);
});
