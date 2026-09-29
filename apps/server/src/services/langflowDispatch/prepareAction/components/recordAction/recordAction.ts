import { ORPCError } from "@orpc/server";
import type { FlowExecutionViewV1, TrellisEvent } from "@trellis/api";
import type { ServiceCtx } from "../../../../../context";
import { type ActionReceiptInput, saveActionReceipt } from "../../../../../db/queries/langflowExecution";
import type { Tx } from "../../../../../db/tx";
import type { DispatchPermit } from "../../../../../langflowHost";
import type { ActionRequest, actionRequest } from "../../../actionRequest";
import { cancelView } from "../../../cancelView";
import { decisionView } from "../../../decisionView";
import { startView } from "../../../startView";

type Input = {
	action: ActionRequest;
	request: ReturnType<typeof actionRequest>;
	permit: DispatchPermit;
	hostId: string;
};
type Outcome =
	| { outcome: "completed"; executionId: string; viewRevision: number; errorCode: null; errorBytes: null }
	| { outcome: "refused"; executionId: null; viewRevision: null; errorCode: string; errorBytes: string };

export async function recordAction(ctx: ServiceCtx, tx: Tx, input: Input) {
	const { action, request, permit, hostId } = input;
	const events: TrellisEvent[] = [];
	const observation: { refused?: ORPCError<string, unknown> } = {};
	let outcome: Outcome;
	try {
		const view: FlowExecutionViewV1 = await tx.transaction(async (savepoint) => {
			try {
				const core = { ...ctx, emit: (event: TrellisEvent) => events.push(event) };
				return action.operation === "start"
					? await startView(core, savepoint, action.input, { hostId })
					: action.operation === "decision"
						? await decisionView(core, savepoint, action.input)
						: await cancelView(core, savepoint, action.input);
			} catch (error) {
				if (error instanceof ORPCError && error.defined && error.status >= 400 && error.status < 500)
					observation.refused = error;
				throw error;
			}
		});
		outcome = {
			outcome: "completed",
			executionId: view.id,
			viewRevision: view.revision,
			errorCode: null,
			errorBytes: null,
		};
	} catch (error) {
		const refused = observation.refused;
		if (refused === undefined || error !== refused) throw error;
		outcome = {
			outcome: "refused",
			executionId: null,
			viewRevision: null,
			errorCode: refused.code,
			errorBytes: JSON.stringify({
				code: refused.code,
				status: refused.status,
				defined: refused.defined,
				message: refused.message,
				data: refused.data,
			}),
		};
	}
	const fields = {
		permit,
		requestBytes: request.requestBytes,
		requestDigest: request.requestDigest,
		...outcome,
		receiptId: crypto.randomUUID(),
		recordedAt: ctx.now.toISOString(),
	};
	const receipt: ActionReceiptInput = { ...fields, sourceBytes: JSON.stringify({ version: 1, ...fields }) };
	await saveActionReceipt(tx, receipt);
	if (outcome.outcome === "completed") for (const event of events) ctx.emit(event);
}
