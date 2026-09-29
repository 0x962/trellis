import { z } from "zod";
import { ReconciliationReceiptSchema } from "../../../dispatchGate/store/schema";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.strictObject({ sourceBytes: z.string().min(1), sourceDigest: digest });
export const OpenedDatabaseEvidenceSchema = z.strictObject({
	dataDir: z.string().min(1),
	bootId: z.string().min(1),
	migrations: source,
	facts: source,
});
export type OpenedDatabaseEvidence = z.infer<typeof OpenedDatabaseEvidenceSchema>;
export const InstalledDatabaseSchema = z.strictObject({
	version: z.literal(1),
	identity: z.strictObject({ version: z.literal(1), home: z.string(), hostId: z.uuid(), dataHomeId: z.uuid() }),
	block: ReconciliationReceiptSchema.shape.block,
	dataDir: z.string().min(1),
	snapshotId: z.uuid(),
	manifestDigest: digest,
	sourceDataHomeId: z.string().min(1),
	inventoryDigest: digest,
	inventory: z.strictObject({
		directories: z.array(z.string()),
		files: z.array(
			z.strictObject({
				path: z.string(),
				sha256: digest,
				size: z.number().int().nonnegative().safe(),
				executable: z.boolean(),
			}),
		),
	}),
});
export type InstalledDatabase = z.infer<typeof InstalledDatabaseSchema>;
export const VerifiedRestoredDatabaseSchema = InstalledDatabaseSchema.omit({ inventory: true }).extend({
	installReceiptId: digest,
	bootId: z.string().min(1),
});
export type VerifiedRestoredDatabase = z.infer<typeof VerifiedRestoredDatabaseSchema>;
export const OpenedDatabaseRecordSchema = z.strictObject({
	version: z.literal(1),
	verified: VerifiedRestoredDatabaseSchema,
	evidence: OpenedDatabaseEvidenceSchema,
});
export type OpenedDatabaseRecord = z.infer<typeof OpenedDatabaseRecordSchema>;
