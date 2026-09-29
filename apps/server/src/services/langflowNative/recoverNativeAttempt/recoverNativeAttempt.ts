import { isDeepStrictEqual } from "node:util";
import { readAttemptReservation } from "../../agentRuns";
import { dispatchNative } from "../dispatchNative";
import { readLaunchSnapshot } from "../launchSnapshot";
import { readReservation } from "../readReservation";

type Reserved = Parameters<typeof dispatchNative>[1];

export async function recoverNativeAttempt(
	ctx: Parameters<typeof dispatchNative>[0],
	input: { executionId: string; stepId: string },
	deps: Parameters<typeof dispatchNative>[2] = {},
) {
	const reservation = await ctx.newTx((tx) => readReservation(tx, input));
	if (reservation.handle.state !== "reserved")
		return { status: "observation_required" as const, handle: reservation.handle };
	if (reservation.launchSnapshotDigest === null) throw new Error("native_launch_snapshot_missing");
	const saved: { executionId: string; stepId: string; requestDigest: string; launch: Reserved["launch"] } = JSON.parse(
		await readLaunchSnapshot(ctx.home, reservation.attemptId, reservation.launchSnapshotDigest),
	);
	if (
		saved.executionId !== input.executionId ||
		saved.stepId !== input.stepId ||
		saved.requestDigest !== reservation.requestDigest ||
		saved.launch.run.id !== reservation.agentRunId ||
		saved.launch.attempt.id !== reservation.attemptId
	)
		throw new Error("native_launch_snapshot_conflict");
	const current = await ctx.newTx((tx) =>
		readAttemptReservation(ctx, tx, {
			runId: reservation.agentRunId,
			attemptId: reservation.attemptId,
			token: saved.launch.attempt.token,
		}),
	);
	if (
		current.attempt.generation !== saved.launch.attempt.generation ||
		current.run.instruction !== saved.launch.run.instruction ||
		current.run.accountId !== saved.launch.run.accountId ||
		!isDeepStrictEqual(current.run.harness, saved.launch.run.harness)
	)
		throw new Error("native_attempt_conflict");
	await dispatchNative(ctx, { reservation, launch: { ...saved.launch, ...current } }, deps);
	const observed = await ctx.newTx((tx) => readReservation(tx, input));
	return { status: "dispatched" as const, handle: observed.handle };
}
