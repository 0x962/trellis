import { z } from "zod";
import { assertOwnerActive } from "../../../db/queries/langflowExecution/ownerFence";
import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { EngineJobBindingV1Schema, protocolDigest, readProtocolBytes } from "../../../langflowContracts";
import { classificationRequest } from "../classificationRequest";
import type { ReviewGateInvocationCtx } from "../prepareInvocation";
import { publishedGates } from "../publishedGates";

export const ClassificationContextRequestSchema = z.strictObject({
	version: z.literal(1),
	...EngineJobBindingV1Schema.shape,
	classificationRequestId: z.uuid(),
});

export async function readClassificationContext(
	ctx: ReviewGateInvocationCtx,
	input: { requestBytes: string; capabilityId: string; authorityBytes: string; authorization: string | null },
) {
	const request = readProtocolBytes(ClassificationContextRequestSchema, input.requestBytes);
	return ctx.withAuthenticatedEngine(input.authorization, (observation) => ctx.newTx(async (tx) => {
		const execution = await lockExecution(tx, request);
		const authority = execution.authority;
		if (!authority || authority.capabilityId !== input.capabilityId ||
			authority.hostId !== observation.identity.hostId || authority.ownerId !== observation.identity.ownerId ||
			ctx.control.archive.readAuthorityBytes(authority) !== input.authorityBytes)
			throw new Error("authority_conflict");
		await assertOwnerActive(tx, authority);
		assertAuthority(execution, authority, "review.classify", ctx.now());
		if (execution.publicationId !== request.publicationId || execution.engineJobId !== request.engineJobId ||
			authority.engineEpoch < request.engineEpoch || execution.diffId === null || execution.reviewedHead === null || execution.cancelIntent)
			throw new Error("review_gate_identity_conflict");
		const requestBytes = classificationRequest({ ...request, diffId: execution.diffId, reviewedHead: execution.reviewedHead }, publishedGates(execution));
		return { version: 1 as const, requestBytes, requestDigest: protocolDigest(requestBytes), authorityDigest: protocolDigest(input.authorityBytes) };
	}));
}
