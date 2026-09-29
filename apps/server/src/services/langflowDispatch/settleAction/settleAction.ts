import { isDeepStrictEqual } from "node:util";
import { ORPCError } from "@orpc/server";
import { readActionReceipt } from "../../../db/queries/langflowExecution";
import { protocolDigest } from "../../../langflowContracts";
import type { DispatchPermit } from "../../../langflowHost";
import type { IoCtx } from "../../support";
import type { actionControl } from "../actionControl";
import { getView } from "../getView";

export async function settleAction(ctx: IoCtx, control: ReturnType<typeof actionControl>, permit: DispatchPermit) {
	const receipt = await ctx.newTx((tx) => readActionReceipt(tx, { permitId: permit.id }));
	if (receipt === null)
		throw new ORPCError("FLOW_ACTION_PENDING", {
			status: 409,
			defined: true,
			data: { requestId: permit.binding.requestId },
		});
	const {
		requestBytes,
		requestDigest,
		outcome,
		executionId,
		viewRevision,
		errorCode,
		errorBytes,
		receiptId,
		sourceBytes,
		sourceDigest,
	} = receipt;
	const stored = JSON.parse(sourceBytes);
	const expected = {
		version: 1,
		permit,
		requestBytes,
		requestDigest,
		...("outcome" in stored
			? { outcome, executionId, viewRevision, errorCode, errorBytes }
			: { executionId, viewRevision }),
		receiptId,
		recordedAt: receipt.recordedAt.toISOString(),
	};
	if (
		!isDeepStrictEqual(receipt.permit, permit) ||
		requestDigest !== permit.binding.payloadDigest ||
		protocolDigest(requestBytes) !== requestDigest ||
		protocolDigest(sourceBytes) !== sourceDigest ||
		!isDeepStrictEqual(stored, expected) ||
		(!("outcome" in stored) && (outcome !== "completed" || errorCode !== null || errorBytes !== null))
	)
		throw new Error("flow_action_receipt_conflict");
	const terminal = control.archive.writeTerminal({ permit, outcome, sourceBytes, sourceDigest });
	await control.gate.settle(permit, terminal.id);
	if (outcome === "refused") {
		if (errorBytes === null) throw new Error("flow_action_error_unavailable");
		const error = JSON.parse(errorBytes);
		throw new ORPCError(error.code, {
			status: error.status,
			defined: error.defined,
			message: error.message,
			data: error.data,
		});
	}
	if (executionId === null) throw new Error("flow_action_execution_unavailable");
	return ctx.newTx((tx) => getView(ctx.core, tx, { id: executionId }));
}
