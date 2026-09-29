import { realpath } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { nativeClient } from "../../../agents/native/connection";
import { langflowNativeHandles, langflowStops } from "../../../db/tables/langflowExecution";
import { StopObligationV1Schema } from "../../../langflowContracts";
import type { DispatchBlock, LangflowHostControl } from "../../../langflowHost";
import { withAttemptOperation } from "../../langflowStops/withAttemptOperation";
import type { IoCtx } from "../../support";
import { readLaunchSnapshot } from "../launchSnapshot";
import { readNativeSnapshotManifest } from "../readNativeSnapshotManifest";

type Context = Pick<IoCtx, "home" | "newTx"> & {
	control: Pick<LangflowHostControl, "identity" | "gate">;
	withSnapshotRetention: <T>(home: string, action: () => Promise<T>) => Promise<T>;
};
type Manifest = Awaited<ReturnType<typeof readNativeSnapshotManifest>>;
type Reservation = typeof langflowNativeHandles.$inferSelect;

function assertBlocked(ctx: Context, block: DispatchBlock) {
	const current = ctx.control.gate.read();
	if (block.dataHomeId !== ctx.control.identity.dataHomeId || !isDeepStrictEqual(current.block, block))
		throw new Error("native_reconciliation_block_conflict");
	if (current.permits.some((entry) => entry.terminal === null)) throw new Error("native_reconciliation_effect_pending");
}

async function withAttempts<T>(home: string, attempts: string[], action: () => Promise<T>, index = 0): Promise<T> {
	const attemptId = attempts[index];
	if (attemptId === undefined) return action();
	return withAttemptOperation(home, attemptId, () => withAttempts(home, attempts, action, index + 1));
}

export async function withNativeReconciliation<T>(
	ctx: Context,
	input: { block: DispatchBlock },
	action: (proof: { manifest: Manifest; reservations: Reservation[] }) => Promise<T>,
	client: Pick<ReturnType<typeof nativeClient>, "inspect"> = nativeClient(ctx.home),
) {
	if ((await realpath(ctx.home)) !== ctx.control.identity.home) throw new Error("native_reconciliation_home_conflict");
	return ctx.withSnapshotRetention(ctx.home, async () => {
		assertBlocked(ctx, input.block);
		const before = await ctx.newTx((tx) => tx.select().from(langflowNativeHandles));
		const attempts = [...new Set(before.map((row) => row.attemptId))].sort();
		return withAttempts(ctx.home, attempts, async () => {
			assertBlocked(ctx, input.block);
			const saved = await ctx.newTx(async (tx) => ({
				reservations: await tx.select().from(langflowNativeHandles),
				stops: await tx.select().from(langflowStops),
				manifest: await readNativeSnapshotManifest(ctx, tx),
			}));
			const currentAttempts = [...new Set(saved.reservations.map((row) => row.attemptId))].sort();
			if (!isDeepStrictEqual(currentAttempts, attempts)) throw new Error("native_reconciliation_inventory_changed");
			if (!saved.manifest.ready)
				return { state: "blocked" as const, reason: "snapshot_unavailable" as const, manifest: saved.manifest };
			for (const row of saved.reservations) {
				const digest = row.launchSnapshotDigest;
				if (digest === null) throw new Error("native_reconciliation_snapshot_missing");
				const snapshot = JSON.parse(await readLaunchSnapshot(ctx.home, row.attemptId, digest));
				if (
					snapshot.executionId !== row.executionId ||
					snapshot.stepId !== row.stepId ||
					snapshot.requestDigest !== row.requestDigest ||
					snapshot.launch.run.id !== row.agentRunId ||
					snapshot.launch.attempt.id !== row.attemptId
				)
					throw new Error("native_reconciliation_snapshot_conflict");
				const stopRow = saved.stops.find(
					(value) => value.executionId === row.executionId && value.attemptId === row.attemptId,
				);
				if (stopRow) {
					const stop = StopObligationV1Schema.parse(stopRow.obligation);
					if (
						stop.executionId !== row.executionId ||
						stop.stepId !== row.stepId ||
						stop.agentRunId !== row.agentRunId ||
						stop.attemptId !== row.attemptId
					)
						throw new Error("native_reconciliation_stop_conflict");
					if (stop.state === "confirmed") continue;
					return { state: "blocked" as const, reason: "native_stop_pending" as const, attemptId: row.attemptId };
				}
				const runtime = await client.inspect(row.attemptId);
				if (
					runtime.id !== row.attemptId ||
					runtime.status === "unknown" ||
					(runtime.status === "exited" && runtime.endedAt === null) ||
					(row.handle.providerSessionId !== null && runtime.agent?.sessionId !== row.handle.providerSessionId)
				)
					return { state: "blocked" as const, reason: "native_ownership_unknown" as const, attemptId: row.attemptId };
			}
			assertBlocked(ctx, input.block);
			const value = await action({ manifest: saved.manifest, reservations: saved.reservations });
			return { state: "completed" as const, value };
		});
	});
}
