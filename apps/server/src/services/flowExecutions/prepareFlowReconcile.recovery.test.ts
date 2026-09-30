import { expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import { openTestDbFromArchive } from "../../db/testDb";
import * as environment from "../../executionEnvironment";
import { cancel } from "./cancel";
import { claimNext } from "./claimNext";
import { prepareFlowReconcile } from "./prepareFlowReconcile";
import { readExecution } from "./queries";
import { recordTaskObservation } from "./recordTaskObservation";
import { testFixture } from "./testFixture";
import type { FlowCtx } from "./types";

test("restart settles completed and failed tasks and retains an unsuccessful stop for the next tick", async () => {
	const env = spyOn(environment, "executionEnvironment").mockResolvedValue({});
	const h = await testFixture();
	let db = h.db;
	try {
		const claims: (NonNullable<Awaited<ReturnType<typeof claimNext>>> & {
			mode: "succeeded" | "failed" | "canceled" | "closed";
		})[] = [];
		for (const mode of ["succeeded", "failed", "canceled", "closed"] as const) {
			const execution = await (await h.createExecution()).create();
			const claim = (await h.run((tx) => claimNext(h.ctx, tx, { id: execution.id })))!;
			claims.push({ ...claim, mode });
			if (mode === "canceled" || mode === "closed") {
				const current = await h.run((tx) => readExecution(tx, execution.id));
				await h.run((tx) =>
					cancel({ ...h.ctx, actor: { kind: "human", name: "Test" } }, tx, {
						id: execution.id,
						expectedRevision: current.revision,
					}),
				);
			} else {
				await db.execute(sql`UPDATE agent_runs SET session_id='session' WHERE id=${claim.run.id}`);
				await h.run((tx) =>
					recordTaskObservation(h.ctx, tx, {
						id: execution.id,
						key: claim.key,
						attemptId: claim.attempt.id,
						attempt: { matched: true, error: null },
						snapshot: {
							state: mode === "succeeded" ? "idle" : "failed",
							sessionId: "session",
							result: mode === "succeeded" ? "Done" : null,
							resultId: "result",
							acknowledgedMessageIds: [claim.attempt.id],
							error: mode === "failed" ? "Worker fails" : null,
						},
					}),
				);
			}
			if (mode === "closed") await db.execute(sql`UPDATE agent_runs SET closed_at=now() WHERE id=${claim.run.id}`);
		}
		const archive = await db.$client.dumpDataDir("none");
		await db.$client.close();
		db = await openTestDbFromArchive(archive);
		const ctx = {
			core: h.ctx,
			home: "restart-candidates",
			newTx: db.transaction.bind(db),
			now: () => h.ctx.now,
		} as FlowCtx;
		const stops: string[] = [];
		let stopFails = true;
		const deps = {
			closeExited: async () => [],
			start: async () => {
				throw new Error("A terminal execution cannot start a task");
			},
			observe: async () => null,
			warn: async () => {},
			stop: async (_ctx: FlowCtx, run: { id: string }) => {
				stops.push(run.id);
				if (stopFails && run.id === claims.find((c) => c.mode === "canceled")!.run.id) throw new Error("Stop waits");
				await db.execute(sql`UPDATE agent_runs SET closed_at=now() WHERE id=${run.id}`);
			},
		};
		expect(await prepareFlowReconcile(ctx, {}, deps)).toEqual({ observed: 4, launched: 0, errors: ["Stop waits"] });
		expect(stops.sort()).toEqual(
			claims
				.filter((c) => c.mode !== "closed")
				.map((c) => c.run.id)
				.sort(),
		);
		stopFails = false;
		expect(await prepareFlowReconcile(ctx, {}, deps)).toEqual({ observed: 1, launched: 0, errors: [] });
		expect(await prepareFlowReconcile(ctx, {}, deps)).toEqual({ observed: 0, launched: 0, errors: [] });
		for (const claim of claims) {
			const execution = await db.transaction((tx) => readExecution(tx, claim.id));
			expect(execution.state.status).toBe(claim.mode === "closed" ? "canceled" : claim.mode);
			expect(execution.state.steps.some((s) => s.needsStop)).toBe(false);
		}
	} finally {
		env.mockRestore();
		await db.$client.close();
	}
}, 30_000);
