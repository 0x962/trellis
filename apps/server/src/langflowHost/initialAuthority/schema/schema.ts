import { z } from "zod";
import { CorrelationReceiptV1Schema, DeliveryAuthorityV1Schema } from "../../../langflowContracts";
import { TerminalReceiptSchema } from "../../dispatchGate/store/schema";

const reference = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const InitialAuthorityInputSchema = z.strictObject({
	executionId: reference,
	hostId: reference,
	projectId: reference,
	publicationId: reference,
	publicationDigest: digest,
	submissionDigest: digest,
	correlation: CorrelationReceiptV1Schema,
	expiresAt: z.iso.datetime(),
	permissions: DeliveryAuthorityV1Schema.shape.permissions,
	permit: TerminalReceiptSchema.shape.permit,
});
export type InitialAuthorityInput = z.infer<typeof InitialAuthorityInputSchema>;
export const InitialAuthorityRecordSchema = z.strictObject({
	version: z.literal(1),
	issuanceReceiptId: z.uuid(),
	input: InitialAuthorityInputSchema,
	observation: z.strictObject({
		id: reference,
		observedAt: z.iso.datetime(),
		endpoint: z.url(),
		identity: z.strictObject({
			dataHomeId: reference,
			hostId: reference,
			ownerId: reference,
			instanceId: reference,
			manifestDigest: digest,
		}),
	}),
	authorityBytes: reference,
});
export type InitialAuthorityRecord = z.infer<typeof InitialAuthorityRecordSchema>;
