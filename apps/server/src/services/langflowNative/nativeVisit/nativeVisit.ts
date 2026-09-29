import { z } from "zod";
import {
	AdmissionReceiptV1Schema,
	DigestSchema,
	OccurrenceV1Schema,
	ReferenceSchema,
	TimestampSchema,
} from "../../../langflowContracts";

export const NativeVisitSchema = z.strictObject({
	engineNodeId: z.string().min(1),
	requestBytes: z.string(),
	engineWaitId: z.uuid(),
	waitBytes: z.string(),
	occurrence: OccurrenceV1Schema,
	scope: z.strictObject({
		inputReceiptIds: z.array(ReferenceSchema),
		groupDeadlineRefs: z.array(ReferenceSchema),
		deadlineAt: TimestampSchema.nullable(),
	}),
	admissionReceipt: AdmissionReceiptV1Schema,
	inputReceipts: z.array(
		z.strictObject({
			receiptId: ReferenceSchema,
			receiptBytes: z.string(),
			receiptDigest: DigestSchema,
		}),
	),
});

export type NativeVisit = z.infer<typeof NativeVisitSchema>;
