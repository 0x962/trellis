import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { langflowOutbox, langflowStops } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import {
	AdmissionReceiptV1Schema,
	type DeliveryAuthorityV1,
	NativeRequestV1Schema,
	protocolDigest,
	readProtocolBytes,
	StopObligationV1Schema,
} from "../../../langflowContracts";
import { findNativeRequest } from "../findNativeRequest";

export async function readNativeRequest(
	ctx: Pick<ServiceCtx, "now"> & { nativeAuthority: DeliveryAuthorityV1 },
	tx: Tx,
	input: { requestBytes: string },
) {
	const request = readProtocolBytes(NativeRequestV1Schema, input.requestBytes);
	const execution = await lockExecution(tx, request);
	await assertAuthority(tx, execution, ctx.nativeAuthority, "native.read", ctx.now);
	const [admission] = await tx
		.select()
		.from(langflowOutbox)
		.where(
			and(
				eq(langflowOutbox.executionId, request.executionId),
				eq(langflowOutbox.kind, "admission"),
				eq(langflowOutbox.id, request.admissionReceipt.admissionId),
			),
		);
	if (
		request.publicationId !== execution.publicationId ||
		request.engineJobId !== execution.engineJobId ||
		!admission ||
		!isDeepStrictEqual(readProtocolBytes(AdmissionReceiptV1Schema, admission.payloadBytes), request.admissionReceipt)
	)
		throw new Error("native_request_binding_conflict");
	const reservation = await findNativeRequest(tx, input);
	const binding = {
		version: 1 as const,
		executionId: request.executionId,
		publicationId: request.publicationId,
		engineJobId: request.engineJobId,
		requestId: request.requestId,
		requestDigest: protocolDigest(input.requestBytes),
		cancelIntent: execution.cancelIntent,
	};
	if (!reservation)
		return {
			...binding,
			state: "absent" as const,
			reconciliation: execution.cancelIntent ? ("cancelled_absent" as const) : ("pending" as const),
		};
	const [savedStop] = await tx
		.select()
		.from(langflowStops)
		.where(and(eq(langflowStops.executionId, request.executionId), eq(langflowStops.attemptId, reservation.attemptId)));
	const stop = savedStop ? StopObligationV1Schema.parse(savedStop.obligation) : null;
	if (
		stop &&
		(stop.executionId !== reservation.executionId ||
			stop.stepId !== reservation.stepId ||
			stop.agentRunId !== reservation.agentRunId ||
			stop.attemptId !== reservation.attemptId)
	)
		throw new Error("stop_attempt_conflict");
	return {
		...binding,
		state: "reserved" as const,
		handle: reservation.handle,
		stop,
		reconciliation: stop?.state === "confirmed" ? ("exited" as const) : ("pending" as const),
	};
}
