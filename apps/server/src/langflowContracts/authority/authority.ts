import { z } from "zod";
import { AdmissionStateV1Schema } from "../correlation";
import {
	DigestSchema,
	EngineJobBindingV1Schema,
	ReferenceSchema,
	RevisionSchema,
	TimestampSchema,
} from "../primitives";

export const DeliveryAuthorityV1Schema = z
	.strictObject({
		version: z.literal(1),
		...EngineJobBindingV1Schema.shape,
		hostId: ReferenceSchema,
		projectId: ReferenceSchema,
		publicationDigest: DigestSchema,
		ownerId: ReferenceSchema,
		ownershipRevision: RevisionSchema,
		capabilityId: ReferenceSchema,
		permissions: z
			.array(
				z.enum([
					"native.reserve",
					"native.read",
					"completion.deliver",
					"decision.deliver",
					"events.append",
					"execution.cancel",
					"review.classify",
					"classification.deliver",
				]),
			)
			.min(1),
		issuedAt: TimestampSchema,
		expiresAt: TimestampSchema,
	})
	.refine((value) => Date.parse(value.expiresAt) > Date.parse(value.issuedAt), "Authority must expire after issue.");
export const TakeoverRequestV1Schema = z.strictObject({
	version: z.literal(1),
	executionId: ReferenceSchema,
	requestId: z.uuid(),
	expectedOwnerId: ReferenceSchema,
	expectedEpoch: RevisionSchema,
	expectedRevision: RevisionSchema,
	newOwnerId: ReferenceSchema,
	supervisorObservationId: ReferenceSchema,
	priorOwnerRevocationId: ReferenceSchema,
});
export const TakeoverReceiptV1Schema = z
	.strictObject({
		version: z.literal(1),
		request: TakeoverRequestV1Schema,
		requestDigest: DigestSchema,
		transferId: ReferenceSchema,
		committedAt: TimestampSchema,
		authority: DeliveryAuthorityV1Schema,
		admission: AdmissionStateV1Schema,
	})
	.refine(
		({ request, authority, admission }) =>
			authority.executionId === request.executionId &&
			authority.ownerId === request.newOwnerId &&
			authority.engineEpoch === request.expectedEpoch + 1 &&
			authority.ownershipRevision === request.expectedRevision + 1 &&
			(admission.state === "closed" ||
				(admission.receipt.executionId === authority.executionId &&
					admission.receipt.publicationId === authority.publicationId &&
					admission.receipt.engineJobId === authority.engineJobId &&
					admission.receipt.engineEpoch === authority.engineEpoch)),
		"Takeover must advance the exact execution owner, epoch, and revision.",
	);
export const RenewalRequestV1Schema = z.strictObject({
	version: z.literal(1),
	requestId: z.uuid(),
	executionId: ReferenceSchema,
	ownerId: ReferenceSchema,
	engineEpoch: RevisionSchema,
	expectedRevision: RevisionSchema,
	supervisorObservationId: ReferenceSchema,
});
export const RenewalReceiptV1Schema = z
	.strictObject({
		version: z.literal(1),
		request: RenewalRequestV1Schema,
		requestDigest: DigestSchema,
		renewalId: ReferenceSchema,
		authority: DeliveryAuthorityV1Schema,
	})
	.refine(
		({ request, authority }) =>
			request.executionId === authority.executionId &&
			request.ownerId === authority.ownerId &&
			request.engineEpoch === authority.engineEpoch &&
			authority.ownershipRevision === request.expectedRevision + 1,
		"Renewal must retain the owner and epoch while advancing the revision.",
	);
export type DeliveryAuthorityV1 = z.infer<typeof DeliveryAuthorityV1Schema>;
export type TakeoverReceiptV1 = z.infer<typeof TakeoverReceiptV1Schema>;
export type TakeoverRequestV1 = z.infer<typeof TakeoverRequestV1Schema>;
export type RenewalRequestV1 = z.infer<typeof RenewalRequestV1Schema>;
export type RenewalReceiptV1 = z.infer<typeof RenewalReceiptV1Schema>;
