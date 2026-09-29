import { isDeepStrictEqual } from "node:util";
import { and, eq, or } from "drizzle-orm";
import { ulid } from "ulid";
import { bindLaunchSnapshot } from "../../../db/queries/langflowExecution";
import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { reserveNative } from "../../../db/queries/langflowExecution/native";
import { langflowNativeHandles } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import {
	NativeHandleV1Schema,
	NativeRequestV1Schema,
	protocolDigest,
	readProtocolBytes,
} from "../../../langflowContracts";
import { reserve } from "../../agentRuns";
import { assertExecutionNotCanceled } from "../../langflowStops";
import { projectLaunchConfig } from "../../projectLaunchConfig";
import { writeLaunchSnapshot } from "../launchSnapshot";
import type { NativeReservationCtx } from "../types";

type NewReservation = Extract<Awaited<ReturnType<typeof reserve>>, { replay: false }>;

export async function reserveNativeRequest(ctx: NativeReservationCtx, tx: Tx, input: { requestBytes: string }) {
	const request = readProtocolBytes(NativeRequestV1Schema, input.requestBytes);
	const execution = await lockExecution(tx, request);
	assertAuthority(execution, ctx.nativeAuthority, "native.reserve", ctx.now);
	const semanticKey = JSON.stringify([
		request.nodeId,
		request.parentOccurrenceKey,
		request.phase,
		request.iterationPath.map((value) => [value.loopNodeId, value.round]),
	]);
	const [existing] = await tx
		.select()
		.from(langflowNativeHandles)
		.where(
			and(
				eq(langflowNativeHandles.executionId, request.executionId),
				or(
					eq(langflowNativeHandles.semanticDigest, protocolDigest(semanticKey)),
					eq(langflowNativeHandles.requestId, request.requestId),
					eq(langflowNativeHandles.occurrenceDigest, protocolDigest(request.occurrenceKey)),
				),
			),
		);
	if (existing) {
		if (existing.requestBytes !== input.requestBytes) throw new Error("identity_conflict");
		return { replay: true as const, reservation: existing, launch: null };
	}
	await assertExecutionNotCanceled(ctx, tx, request);
	if (
		execution.cancelIntent ||
		execution.admission.state !== "open" ||
		!isDeepStrictEqual(execution.admission.receipt, request.admissionReceipt)
	)
		throw new Error("admission_closed");
	if (request.deadlineAt !== null && Date.parse(request.deadlineAt) <= ctx.now.getTime())
		throw new Error("native_deadline_elapsed");
	const approved = await ctx.resolveOccurrence(tx, { execution, request, requestBytes: input.requestBytes });
	if (approved.requestDigest !== protocolDigest(input.requestBytes) || approved.specHash !== request.specHash)
		throw new Error("native_spec_conflict");
	const config = await projectLaunchConfig(tx, { projectId: execution.projectId, harness: approved.harness });
	const permit = ctx.dispatchGate.acquire({
		effectId: `native-reservation:${request.executionId}:${request.requestId}`,
		kind: "native-dispatch",
		executionId: request.executionId,
		attemptId: null,
		jobId: request.engineJobId,
		requestId: request.requestId,
		payloadDigest: protocolDigest(input.requestBytes),
	});
	// reserve returns a new attempt when its input omits requestId.
	const launch = (await reserve(ctx, tx, { ticket: execution.ticketId, accountId: approved.accountId }, [], {
		config,
		flow: { name: approved.name, instruction: approved.instruction },
	})) as NewReservation;
	const handle = NativeHandleV1Schema.parse({
		version: 1,
		stepId: ulid(),
		agentRunId: launch.run.id,
		attemptId: launch.attempt.id,
		workspaceId: null,
		providerSessionId: null,
		state: "reserved",
		revision: 1,
	});
	const reservation = await reserveNative(tx, {
		requestBytes: input.requestBytes,
		taskKey: approved.taskKey,
		handle,
		authority: ctx.nativeAuthority,
		now: ctx.now,
	});
	const digest = await writeLaunchSnapshot(
		ctx.home,
		launch.attempt.id,
		JSON.stringify({
			executionId: request.executionId,
			stepId: handle.stepId,
			requestDigest: reservation.requestDigest,
			launch,
		}),
	);
	await bindLaunchSnapshot(tx, {
		executionId: request.executionId,
		stepId: handle.stepId,
		attemptId: handle.attemptId,
		digest,
	});
	return { replay: false as const, reservation: { ...reservation, launchSnapshotDigest: digest }, launch, permit };
}
