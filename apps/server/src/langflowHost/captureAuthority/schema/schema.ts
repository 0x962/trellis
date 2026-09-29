import { z } from "zod";
import { protocolDigest } from "../../../langflowContracts";

const name = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const CaptureGrantSchema = z
	.strictObject({
		version: z.literal(1),
		id: z.uuid(),
		block: z.strictObject({
			id: z.uuid(),
			dataHomeId: z.uuid(),
			generation: z.number().int().positive().safe(),
			requestId: name,
			reason: z.strictObject({ kind: z.literal("capture"), snapshotId: name }),
		}),
		identity: z.strictObject({
			dataHomeId: z.uuid(),
			hostId: z.uuid(),
			ownerId: z.uuid(),
			instanceId: z.uuid(),
			manifestDigest: digest,
		}),
		snapshotId: name,
		boundaryReceiptId: name,
	})
	.refine(
		(grant) =>
			grant.block.dataHomeId === grant.identity.dataHomeId && grant.block.reason.snapshotId === grant.snapshotId,
		"capture_binding_mismatch",
	);
export const CaptureReceiptSchema = z.strictObject({
	grantBytes: name,
	state: z.enum(["active", "revoked"]),
	receiptId: digest,
});
export const CaptureRecordSchema = z
	.strictObject({
		grantBytes: name,
		phase: z.enum(["issued", "active", "revoking", "revoked"]),
		receipt: CaptureReceiptSchema.nullable(),
	})
	.superRefine((record, ctx) => {
		CaptureGrantSchema.parse(JSON.parse(record.grantBytes));
		if (record.receipt) {
			const receipt = record.receipt;
			if (
				receipt.grantBytes !== record.grantBytes ||
				receipt.receiptId !== protocolDigest(JSON.stringify({ grantBytes: receipt.grantBytes, state: receipt.state }))
			)
				ctx.addIssue({ code: "custom", message: "capture_receipt_mismatch" });
		}
		if ((record.phase === "revoked" || record.phase === "active") && record.receipt?.state !== record.phase)
			ctx.addIssue({ code: "custom", message: "capture_phase_mismatch" });
	});
export type CaptureGrant = z.infer<typeof CaptureGrantSchema>;
export type CaptureReceipt = z.infer<typeof CaptureReceiptSchema>;
export type CaptureRecord = z.infer<typeof CaptureRecordSchema>;
