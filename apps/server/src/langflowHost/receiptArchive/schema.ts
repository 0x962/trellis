import { z } from "zod";
import { ReconciliationReceiptSchema, TerminalReceiptSchema } from "../dispatchGate/store/schema";

const source = z.strictObject({ sourceBytes: z.string().min(1), sourceDigest: z.string().regex(/^[a-f0-9]{64}$/) });
export type ValidationSource = z.infer<typeof source>;
export const TerminalArchiveSchema = z.strictObject({
	kind: z.literal("terminal"),
	permit: TerminalReceiptSchema.shape.permit,
	outcome: TerminalReceiptSchema.shape.outcome,
	source,
});
export const ReconciliationArchiveSchema = z.strictObject({
	kind: z.literal("reconciliation"),
	block: ReconciliationReceiptSchema.shape.block,
	packageDigest: ReconciliationReceiptSchema.shape.packageDigest,
	sources: z.strictObject({
		trellisDatabase: source,
		engineDatabase: source,
		secret: source,
		ownership: source,
		nativeAttempts: source,
		stopObligations: source,
		snapshotSeal: source.nullable(),
	}),
});
export type ReconciliationSources = z.infer<typeof ReconciliationArchiveSchema>["sources"];
export const StopSnapshotSchema = z.object({
	version: z.literal(1),
	dataHomeId: z.string(),
	blockId: z.string(),
	generation: z.number().int(),
	records: z.array(z.object({ stops: z.array(z.object({ state: z.string() })) })),
});
export const NativeSnapshotSchema = z.object({ ready: z.literal(true), unavailable: z.array(z.unknown()).length(0) });

export const AuthorityArchiveSchema = z.strictObject({
	kind: z.literal("authority"),
	dataHomeId: z.string().min(1),
	issuanceReceiptId: z.string().min(1),
	authorityBytes: z.string().min(1),
});
