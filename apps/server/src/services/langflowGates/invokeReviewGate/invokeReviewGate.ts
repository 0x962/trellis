import { isDeepStrictEqual } from "node:util";
import { classificationStore } from "../../../db/queries/langflowExecution/classification";
import { lockExecution } from "../../../db/queries/langflowExecution/executions";
import { protocolDigest, readProtocolBytes } from "../../../langflowContracts";
import { settleReviewClassification } from "../../langflowDispatch/settleReviewClassification";
import type { ClassificationDependencies } from "../classifyReviewArea";
import { ReviewGateRequestSchema, ReviewGateResponseSchema, type ReviewGateResponse } from "../invocationProtocol";
import { deliverClassification } from "../deliverClassification";
import { prepareInvocation, type ReviewGateInvocationCtx } from "../prepareInvocation";
import { reviewGate } from "../reviewGate";

export type { ReviewGateInvocationCtx };

export async function invokeReviewGate(
	ctx: ReviewGateInvocationCtx,
	input: { requestBytes: string; capabilityId: string; authorityBytes: string; authorization: string | null },
	deps?: ClassificationDependencies,
): Promise<ReviewGateResponse> {
	const request = readProtocolBytes(ReviewGateRequestSchema, input.requestBytes);
	const saved = await prepareInvocation(ctx, input, request);
	const result = await reviewGate(ctx, {
		executionId: request.executionId, diffId: request.diffId, reviewedHead: request.reviewedHead,
		publication: { publicationId: request.publicationId, gates: saved.gates }, gateNodeId: request.nodeId,
	}, {
		claim: async () => saved.claim,
		finish: async (tx, finish) => {
			const current = await lockExecution(tx, request);
			const retained = isDeepStrictEqual(current.authority, saved.authority) && Date.parse(saved.authority.expiresAt) > ctx.now().getTime();
			return classificationStore.finish(tx, {
				...finish,
				result: retained ? finish.result : { state: "failed", error: "Jev gate: execution authority ended." },
			});
		},
	}, deps, {
		afterValidatedResponse: async (receipt) => {
			await settleReviewClassification(ctx, ctx.control, { permit: saved.permit!, receiptId: receipt.receiptId });
		},
	});
	const receipt = result.receipt;
	const response = ReviewGateResponseSchema.parse({
		version: 1,
		visit: request,
		visitDigest: protocolDigest(input.requestBytes),
		result: {
			version: 1,
			classificationRequestId: request.classificationRequestId,
			classificationRequestDigest: protocolDigest(receipt.requestBytes),
			classificationReceiptId: receipt.receiptId,
			state: receipt.state,
			relevance: receipt.relevance,
			error: receipt.error,
		},
	});
	await deliverClassification(ctx, input, response);
	return response;
}
