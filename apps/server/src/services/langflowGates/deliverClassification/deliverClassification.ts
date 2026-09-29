import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { assertOwnerActive } from "../../../db/queries/langflowExecution/ownerFence";
import { protocolDigest, readProtocolBytes } from "../../../langflowContracts";
import { ReviewClassificationAcceptanceV1Schema, ReviewClassificationDeliveryV1Schema, ReviewWaitV1Schema } from "../../../langflowContracts/review";
import { classificationRequest } from "../classificationRequest";
import { ReviewGateRequestSchema, type ReviewGateResponse } from "../invocationProtocol";
import type { ReviewGateInvocationCtx } from "../prepareInvocation";
import { publishedGates } from "../publishedGates";

const externalWait = z.strictObject({ kind: z.literal("review"), waitId: z.string(), request: ReviewWaitV1Schema });

export async function deliverClassification(ctx: ReviewGateInvocationCtx,
	input: { requestBytes: string; capabilityId: string; authorityBytes: string; authorization: string | null },
	response: ReviewGateResponse,
) {
	if (response.result.state === "claimed") return;
	const prepared = await ctx.withAuthenticatedEngine(input.authorization, async (observation) => {
		const saved = await ctx.newTx(async (tx) => {
			const execution = await lockExecution(tx, response.visit);
			const authority = execution.authority;
			if (!authority || authority.capabilityId !== input.capabilityId ||
				authority.hostId !== observation.identity.hostId || authority.ownerId !== observation.identity.ownerId ||
				ctx.control.archive.readAuthorityBytes(authority) !== input.authorityBytes) throw new Error("authority_conflict");
			await assertOwnerActive(tx, authority);
			assertAuthority(execution, authority, "classification.deliver", ctx.now());
			if (execution.cancelIntent) return null;
			return { execution, authority, gates: publishedGates(execution) };
		});
		if (!saved) return [];
		const proofs = await ctx.resolveOccurrence({ ...saved, request: response.visit, ...input });
		return proofs.visits.map((proof) => {
			const visit = readProtocolBytes(ReviewGateRequestSchema, proof.requestBytes);
			const wait = readProtocolBytes(externalWait, proof.waitBytes);
			const gate = saved.gates.find((entry) => entry.engineVertexId === proof.engineVertexId);
			if (!gate || gate.nodeId !== visit.nodeId || gate.specHash !== visit.specHash ||
				visit.executionId !== response.visit.executionId || visit.publicationId !== response.visit.publicationId ||
				visit.engineJobId !== response.visit.engineJobId || visit.classificationRequestId !== response.result.classificationRequestId ||
				visit.diffId !== saved.execution.diffId || visit.reviewedHead !== saved.execution.reviewedHead ||
				protocolDigest(classificationRequest(visit, saved.gates)) !== response.result.classificationRequestDigest ||
				!isDeepStrictEqual(wait.request.visit, visit) || wait.request.visitDigest !== protocolDigest(proof.requestBytes) ||
				wait.request.reviewArea !== gate.reviewArea) throw new Error("review_gate_occurrence_conflict");
			const resultBytes = JSON.stringify({ version: 1, visit, visitDigest: protocolDigest(proof.requestBytes), result: response.result });
			const resultDigest = protocolDigest(resultBytes);
			const delivery = ReviewClassificationDeliveryV1Schema.parse({ version: 1, wait: wait.request,
				result: JSON.parse(resultBytes), resultDigest, authority: saved.authority });
			const deliveryBytes = JSON.stringify(delivery);
			const binding = { effectId: JSON.stringify(["review-delivery", visit.executionId, visit.requestId, resultDigest, saved.authority.capabilityId]),
				kind: "engine-delivery" as const, executionId: visit.executionId, jobId: visit.engineJobId, attemptId: null,
				requestId: visit.requestId, payloadDigest: protocolDigest(deliveryBytes) };
			const prior = ctx.control.gate.recoverPermit(binding);
			return { visit, wait, resultBytes, resultDigest, deliveryBytes, authority: saved.authority,
				permit: prior?.permit ?? ctx.control.gate.acquire(binding), settled: prior !== null && prior.terminal !== null };
		});
	});
	for (const item of prepared) {
		if (item.settled) continue;
		const received = await ctx.accept({ engineWaitId: item.wait.waitId, resultBytes: item.resultBytes,
			deliveryBytes: item.deliveryBytes, authorityBytes: input.authorityBytes, capabilityId: item.authority.capabilityId });
		if (received.state === "unknown" || received.status !== 200) continue;
		const sourceBytes = new TextDecoder().decode(received.bytes);
		const acceptance = readProtocolBytes(ReviewClassificationAcceptanceV1Schema, sourceBytes);
		if (acceptance.executionId !== item.visit.executionId || acceptance.engineJobId !== item.visit.engineJobId ||
			acceptance.engineRequestId !== item.visit.requestId || acceptance.engineWaitId !== item.wait.waitId ||
			acceptance.classificationReceiptId !== response.result.classificationReceiptId || acceptance.resultDigest !== item.resultDigest)
			throw new Error("review_gate_acceptance_conflict");
		const terminal = ctx.control.archive.writeTerminal({ permit: item.permit, outcome: "completed", sourceBytes, sourceDigest: protocolDigest(sourceBytes) });
		await ctx.control.gate.settle(item.permit, terminal.id);
	}
}
