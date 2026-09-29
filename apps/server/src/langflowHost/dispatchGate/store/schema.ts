import { z } from "zod";

const identity = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const generation = z.number().int().nonnegative().safe();
const permit = z.strictObject({
	id: z.uuid(),
	dataHomeId: identity,
	generation,
	binding: z.strictObject({
		effectId: identity,
		kind: z.enum([
			"admission",
			"publication",
			"recovery",
			"native-dispatch",
			"engine-delivery",
			"decision",
			"cancellation",
		]),
		executionId: identity.nullable(),
		attemptId: identity.nullable(),
		jobId: identity.nullable(),
		requestId: identity,
		payloadDigest: digest,
	}),
});
const block = z.strictObject({
	id: z.uuid(),
	dataHomeId: identity,
	generation,
	requestId: identity,
	reason: z.discriminatedUnion("kind", [
		z.strictObject({ kind: z.literal("capture"), snapshotId: identity }),
		z.strictObject({ kind: z.literal("initialize") }),
		z.strictObject({
			kind: z.literal("restore"),
			directory: identity,
			snapshotId: identity,
			sourceDataHomeId: identity,
			manifestDigest: digest,
		}),
	]),
});
export const TerminalReceiptSchema = z.strictObject({
	id: identity,
	permit,
	outcome: z.enum(["completed", "refused", "cancelled"]),
});
export const ReconciliationReceiptSchema = z.strictObject({
	id: identity,
	block,
	packageDigest: digest,
	trellisDatabaseReceiptId: identity,
	engineDatabaseReceiptId: identity,
	secretReceiptId: identity,
	ownershipReceiptId: identity,
	nativeAttemptsReceiptId: identity,
	stopObligationsReceiptId: identity,
	snapshotSealReceiptId: identity.nullable(),
});
export const DispatchStateSchema = z.strictObject({
	version: z.literal(1),
	dataHomeId: identity,
	generation,
	block: block.nullable(),
	permits: z.array(z.strictObject({ permit, terminal: TerminalReceiptSchema.nullable() })),
	reconciliations: z.array(ReconciliationReceiptSchema),
});
