import { isDeepStrictEqual } from "node:util";
import { classificationStore } from "../../../db/queries/langflowExecution/classification";
import { assertOwnerActive } from "../../../db/queries/langflowExecution/ownerFence";
import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { protocolDigest, type DeliveryAuthorityV1 } from "../../../langflowContracts";
import type { DispatchEffects, DispatchReceiptArchive } from "../../../langflowHost";
import type { LiveOwnership } from "../../../langflowHost/contracts";
import type { ServiceCtx } from "../../support";
import { classificationRequest } from "../classificationRequest";
import type { ReviewGateRequest } from "../invocationProtocol";
import type { ReviewVisitProof, reviewGateEngine } from "../reviewGateEngine";
import { publishedGates } from "../publishedGates";

type Execution = Awaited<ReturnType<typeof lockExecution>>;
export type ReviewGateInvocationCtx = Pick<ServiceCtx, "newTx" | "now" | "log"> & {
	control: { gate: DispatchEffects; archive: DispatchReceiptArchive };
	withAuthenticatedEngine<T>(authorization: string | null, operation: (observation: LiveOwnership) => Promise<T>): Promise<T>;
	resolveOccurrence(input: {
		execution: Execution; request: ReviewGateRequest; requestBytes: string; authorityBytes: string; authority: DeliveryAuthorityV1;
	}): Promise<ReviewVisitProof>;
	accept: ReturnType<typeof reviewGateEngine>["accept"];
};

export async function prepareInvocation(
	ctx: ReviewGateInvocationCtx,
	input: { requestBytes: string; capabilityId: string; authorityBytes: string; authorization: string | null },
	request: ReviewGateRequest,
) {
	return ctx.withAuthenticatedEngine(input.authorization, async (observation) => {
		const read = async (tx: Parameters<typeof lockExecution>[0]) => {
			const execution = await lockExecution(tx, request);
			const authority = execution.authority;
			if (!authority || authority.capabilityId !== input.capabilityId ||
				authority.hostId !== observation.identity.hostId || authority.ownerId !== observation.identity.ownerId ||
				ctx.control.archive.readAuthorityBytes(authority) !== input.authorityBytes)
				throw new Error("authority_conflict");
			await assertOwnerActive(tx, authority);
			assertAuthority(execution, authority, "review.classify", ctx.now());
			if (execution.publicationId !== request.publicationId || execution.engineJobId !== request.engineJobId ||
				authority.engineEpoch < request.engineEpoch || execution.diffId !== request.diffId || execution.reviewedHead !== request.reviewedHead)
				throw new Error("review_gate_identity_conflict");
			return { execution, authority, gates: publishedGates(execution) };
		};
		const saved = await ctx.newTx(read);
		const approved = await ctx.resolveOccurrence({ execution: saved.execution, request, requestBytes: input.requestBytes, authorityBytes: input.authorityBytes, authority: saved.authority });
		const gate = saved.gates.find((entry) => entry.engineVertexId === approved.engineVertexId);
		if (approved.requestBytes !== input.requestBytes || !gate || gate.nodeId !== request.nodeId || gate.specHash !== request.specHash)
			throw new Error("review_gate_occurrence_conflict");
		const classificationBytes = classificationRequest(request, saved.gates);
		if (protocolDigest(classificationBytes) !== request.classificationRequestDigest)
			throw new Error("review_gate_identity_conflict");
		const claim = await ctx.newTx(async (tx) => {
			const current = await read(tx);
			if (!isDeepStrictEqual(current.authority, saved.authority) || !isDeepStrictEqual(current.gates, saved.gates))
				throw new Error("authority_conflict");
			return classificationStore.claim(tx, {
				binding: { executionId: request.executionId, publicationId: request.publicationId, diffId: request.diffId, reviewedHead: request.reviewedHead },
				ownerToken: crypto.randomUUID(),
				requestBytes: classificationBytes,
			});
		});
		const permit = claim.acquired ? ctx.control.gate.acquire({
			effectId: JSON.stringify(["review-classification", request.executionId, claim.receipt.receiptId]),
			kind: "review-classification", executionId: request.executionId, attemptId: null,
			jobId: request.engineJobId, requestId: claim.receipt.receiptId, payloadDigest: protocolDigest(claim.receipt.requestBytes),
		}) : null;
		return { ...saved, claim, permit };
	});
}
