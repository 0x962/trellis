import { z } from "zod";
import { DeliveryAuthorityV1Schema } from "../authority";
import { NativeHandleV1Schema, NativeLaunchProvenanceV1Schema } from "../native";
import {
	DigestSchema,
	EngineJobBindingV1Schema,
	ReferenceSchema,
	RevisionSchema,
	TimestampSchema,
} from "../primitives";
import { protocolDigest } from "../protocolBytes";

export const NativeResultV1Schema = z
	.strictObject({
		version: z.literal(1),
		launchBinding: EngineJobBindingV1Schema,
		requestDigest: DigestSchema,
		completionId: ReferenceSchema,
		stepId: ReferenceSchema,
		agentRunId: ReferenceSchema,
		attemptId: z.uuid(),
		providerSessionId: ReferenceSchema,
		promptReceiptId: ReferenceSchema,
		resultId: ReferenceSchema,
		resultVersion: RevisionSchema,
		output: z.string(),
		outputHash: DigestSchema,
		artifactRefs: z.array(z.strictObject({ artifactId: ReferenceSchema, contentHash: DigestSchema })),
		exitKind: z.enum(["completed", "process_error", "timeout", "canceled"]),
	})
	.refine((value) => protocolDigest(value.output) === value.outputHash, "Output bytes must match their digest.");
export const NativeCompletionV1Schema = z
	.strictObject({
		version: z.literal(1),
		provenance: NativeLaunchProvenanceV1Schema,
		handle: NativeHandleV1Schema,
		result: NativeResultV1Schema,
	})
	.refine(
		({ provenance, handle, result }) =>
			["stepId", "agentRunId", "attemptId"].every((key) => {
				const field = key as "stepId" | "agentRunId" | "attemptId";
				return provenance[field] === handle[field] && handle[field] === result[field];
			}) &&
			result.providerSessionId === handle.providerSessionId &&
			result.promptReceiptId === provenance.attemptId &&
			result.requestDigest === provenance.requestDigest &&
			result.launchBinding.executionId === provenance.request.executionId &&
			result.launchBinding.publicationId === provenance.request.publicationId &&
			result.launchBinding.engineJobId === provenance.request.engineJobId &&
			result.launchBinding.engineEpoch === provenance.request.engineEpoch,
		"Completion requires the reserved attempt, session, prompt receipt, and immutable launch binding.",
	);
export const CompletionDeliveryV1Schema = z
	.strictObject({
		version: z.literal(1),
		result: NativeResultV1Schema,
		resultDigest: DigestSchema,
		authority: DeliveryAuthorityV1Schema,
	})
	.refine(
		({ result, authority }) =>
			result.launchBinding.executionId === authority.executionId &&
			result.launchBinding.publicationId === authority.publicationId &&
			result.launchBinding.engineJobId === authority.engineJobId &&
			result.launchBinding.engineEpoch <= authority.engineEpoch &&
			authority.permissions.includes("completion.deliver"),
		"Delivery must retain the original execution, publication, and job.",
	);
export const CompletionReceiptV1Schema = z.strictObject({
	version: z.literal(1),
	executionId: ReferenceSchema,
	engineJobId: z.uuid(),
	completionId: ReferenceSchema,
	resultDigest: DigestSchema,
	engineWaitId: ReferenceSchema,
	continuationReceiptId: ReferenceSchema,
	acceptedAt: TimestampSchema,
});
export type NativeResultV1 = z.infer<typeof NativeResultV1Schema>;
export type CompletionDeliveryV1 = z.infer<typeof CompletionDeliveryV1Schema>;
export type NativeCompletionV1 = z.infer<typeof NativeCompletionV1Schema>;
export type CompletionReceiptV1 = z.infer<typeof CompletionReceiptV1Schema>;
