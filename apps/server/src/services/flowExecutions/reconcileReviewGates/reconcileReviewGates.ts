import { sql } from "drizzle-orm";
import { advanceFlow } from "../../../agents/nativeFlow/advanceFlow.ts";
import { taskKey } from "../../../agents/nativeFlow/taskKey.ts";
import { rows } from "../../../db/queries/support.ts";
import { reviewPaths } from "../../../gh/reviewPaths";
import { reviewRelevance } from "../../providers/reviewRelevance";
import { readExecution } from "../queries.ts";
import { saveState } from "../saveState.ts";
import type { FlowCtx } from "../types.ts";

type Dependencies = { paths: typeof reviewPaths; evaluate: typeof reviewRelevance };

export async function reconcileReviewGates(
	ctx: FlowCtx,
	id: string,
	deps: Dependencies = { paths: reviewPaths, evaluate: reviewRelevance },
) {
	while (true) {
		const claimed = await ctx.newTx(async (tx) => {
			const execution = await readExecution(tx, id, true);
			let state = advanceFlow(execution.doc, execution.state, { type: "tick" }, ctx.now().getTime());
			const gates = state.steps.filter(
				(step) =>
					["ready", "running"].includes(step.state) &&
					execution.doc.nodes.find((node) => node.id === step.nodeId)!.reviewArea != null,
			);
			const step = gates.find((step) => step.state === "running") ?? gates[0];
			if (state.status !== "running" || !step) {
				await saveState(ctx.core, tx, execution, state);
				return null;
			}
			const key = taskKey(step);
			const interrupted = step.state === "running";
			state = advanceFlow(execution.doc, state, { type: "started", key }, ctx.now().getTime());
			state = advanceFlow(
				execution.doc,
				state,
				{ type: "launched", key, at: ctx.now().getTime() },
				ctx.now().getTime(),
			);
			await saveState(ctx.core, tx, execution, state);
			return {
				execution,
				key,
				interrupted,
				area: execution.doc.nodes.find((node) => node.id === step.nodeId)!.reviewArea!,
			};
		});
		if (claimed === null) return;
		let relevance = claimed.execution.state.reviewRelevance;
		let error: string | undefined;
		try {
			if (claimed.interrupted) throw new Error("The Jev gate was interrupted before it saved a result.");
			if (!relevance) {
				const pull = await ctx.newTx(async (tx) => {
					const [row] = await rows<{ owner: string; repo: string; number: number }>(
						tx,
						sql`SELECT owner,repo,number FROM pull_requests WHERE id=${claimed.execution.diff_id}`,
					);
					if (!row || !claimed.execution.head_sha)
						throw new Error("The Jev gate needs a linked diff and its reviewed commit.");
					return { ...row, headSha: claimed.execution.head_sha };
				});
				relevance = await deps.evaluate(ctx, await deps.paths(pull));
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
		await ctx.newTx(async (tx) => {
			const execution = await readExecution(tx, id, true);
			const now = ctx.now().getTime();
			const state = advanceFlow(execution.doc, execution.state, { type: "tick" }, now);
			const event =
				error === undefined
					? {
							type: "complete" as const,
							key: claimed.key,
							output: JSON.stringify(relevance),
							decision: relevance![claimed.area] ? ("yes" as const) : ("no" as const),
						}
					: { type: "fail" as const, key: claimed.key, error: `Jev gate: ${error}` };
			const next = advanceFlow(execution.doc, state, event, now);
			if (relevance && next.steps.find((step) => taskKey(step) === claimed.key)?.state === "succeeded")
				next.reviewRelevance = relevance;
			await saveState(ctx.core, tx, execution, next);
		});
	}
}
