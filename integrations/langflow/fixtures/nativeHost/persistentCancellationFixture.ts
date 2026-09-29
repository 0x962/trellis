import { taskKey } from "../../../../apps/server/src/agents/nativeFlow/taskKey.ts";
import type { Tx } from "../../../../apps/server/src/db/tx.ts";
import { refreshNative } from "../../../../apps/server/src/services/agentRuns/nativeLifecycle.ts";
import { cancel } from "../../../../apps/server/src/services/flowExecutions/cancel.ts";
import { decide } from "../../../../apps/server/src/services/flowExecutions/decide.ts";
import { drainFlowStops } from "../../../../apps/server/src/services/flowExecutions/drainFlowStops.ts";
import { readExecution } from "../../../../apps/server/src/services/flowExecutions/queries.ts";
import type { openPersistentNativeLifecycleFixture } from "./persistentNativeLifecycleFixture.ts";

export function persistentCancellationFixture(
	fixture: Awaited<ReturnType<typeof openPersistentNativeLifecycleFixture>>,
) {
	const { ctx, metadata, processes } = fixture;
	const human = { ...ctx.core, actor: { kind: "human" as const, name: "Cancellation fixture" } };
	const stateIn = async (tx: Tx) => {
		const current = await readExecution(tx, metadata.executionId);
		return {
			revision: current.revision,
			status: current.state.status,
			error: current.state.error,
			steps: current.state.steps.map((step) => ({
				key: taskKey(step),
				nodeId: step.nodeId,
				state: step.state,
				needsStop: step.needsStop,
				error: step.error,
				output: step.output,
			})),
		};
	};
	const state = () => ctx.newTx(stateIn);
	const cancelAt = (revision: number, pause?: (value: Awaited<ReturnType<typeof stateIn>>) => Promise<void>) =>
		ctx.newTx(async (tx) => {
			await cancel(human, tx, { id: metadata.executionId, expectedRevision: revision });
			const value = await stateIn(tx);
			await pause?.(value);
			return value;
		});
	const decideAt = (revision: number, key: string) =>
		ctx.newTx((tx) =>
			decide(human, tx, {
				id: metadata.executionId,
				expectedRevision: revision,
				key,
				approved: true,
				output: "Accepted by fixture",
			}),
		);
	const stop = async (failure: string | null) => {
		processes.failStops(failure);
		return drainFlowStops(ctx, metadata.executionId, async (_ctx, run) => {
			await processes.stop(run.terminalId!);
			await refreshNative(ctx, run, (id) => processes.inspect(id));
		});
	};
	return { state, cancelAt, decideAt, stop };
}
