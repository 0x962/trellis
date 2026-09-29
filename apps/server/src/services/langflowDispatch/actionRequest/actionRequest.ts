import type {
	ActorRef,
	FlowExecutionCancelInput,
	FlowExecutionDecisionInput,
	FlowExecutionStartInput,
} from "@trellis/api";
import { protocolDigest } from "../../../langflowContracts";
import type { EffectBinding } from "../../../langflowHost";

export type ActionRequest =
	| { operation: "start"; input: FlowExecutionStartInput }
	| { operation: "decision"; input: FlowExecutionDecisionInput }
	| { operation: "cancel"; input: FlowExecutionCancelInput };

export function actionRequest(actor: ActorRef, action: ActionRequest) {
	const identity = { kind: actor.kind, name: actor.name };
	const requestBytes = JSON.stringify({ version: 1, actor: identity, ...action });
	const requestDigest = protocolDigest(requestBytes);
	const requestId =
		action.operation === "start"
			? action.input.requestId
			: protocolDigest(
					JSON.stringify({
						id: action.input.id,
						revision: action.input.expectedRevision,
						key: action.operation === "decision" ? action.input.key : null,
					}),
				);
	const binding: EffectBinding = {
		effectId: `flow-action:${protocolDigest(JSON.stringify({ actor: identity, operation: action.operation, requestId }))}`,
		kind: action.operation === "start" ? "admission" : action.operation === "cancel" ? "cancellation" : "decision",
		executionId: action.operation === "start" ? null : action.input.id,
		attemptId: null,
		jobId: null,
		requestId,
		payloadDigest: requestDigest,
	};
	return { requestBytes, requestDigest, binding };
}
