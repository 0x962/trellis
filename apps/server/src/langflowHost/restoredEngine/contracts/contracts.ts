import { z } from "zod";
import { LoadQualifiedPackageInputSchema } from "../../../../../../integrations/langflow/release";
import { ReconciliationReceiptSchema } from "../../dispatchGate/store/schema";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const imageDigest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identity = z.strictObject({ version: z.literal(1), home: z.string().min(1), hostId: z.uuid(), dataHomeId: z.uuid() });
export const RestoredEngineInputSchema = z.strictObject({
	home: z.string().min(1),
	hostId: z.uuid(),
	dataHomeId: z.uuid(),
	block: ReconciliationReceiptSchema.shape.block,
	qualification: LoadQualifiedPackageInputSchema,
});
export type RestoredEngineInput = z.infer<typeof RestoredEngineInputSchema>;
const source = z.strictObject({ sourceBytes: z.string(), sourceDigest: digest });
const capturedFile = z.strictObject({ sha256: digest, size: z.number().int().positive().safe() });
export const EngineInstallIntentSchema = z.strictObject({
	version: z.literal(1),
	identity,
	block: ReconciliationReceiptSchema.shape.block,
	capture: z.strictObject({
		snapshotId: z.uuid(), sourceHostId: z.string().min(1), sourceDataHomeId: z.string().min(1),
		boundaryReceiptId: z.string().min(1), manifest: source, engineReceipt: source,
		database: capturedFile, secret: capturedFile, revisions: z.array(z.string()), tables: z.array(z.string()),
	}),
	package: z.strictObject({
		enginePackageDigest: digest, imageConfigDigest: imageDigest, imageDigest,
		qualificationSha256: digest, manifestDigest: digest, architecture: z.enum(["arm64", "amd64"]),
	}),
	target: z.strictObject({
		privateRoot: z.string(), privateRootDigest: digest,
		volumes: z.strictObject({ data: z.string(), secrets: z.string() }),
		databasePath: z.literal("/data/config/langflow.db"), secretPath: z.literal("/run/trellis-secrets/engine-secret"),
	}),
});
export type EngineInstallIntent = z.infer<typeof EngineInstallIntentSchema>;
const installedFile = capturedFile.extend({ uid: z.literal(10001), gid: z.literal(10001) });
export const EngineDestinationEvidenceSchema = z.strictObject({
	version: z.literal(1), intentDigest: digest,
	database: installedFile.extend({ mode: z.literal("0600") }),
	secret: installedFile.extend({ mode: z.literal("0400") }),
	revisions: z.array(z.string()), tables: z.array(z.string()),
});
export type EngineDestinationEvidence = z.infer<typeof EngineDestinationEvidenceSchema>;
export const RestoredEngineReceiptSchema = z.strictObject({
	version: z.literal(1), intent: EngineInstallIntentSchema, destination: EngineDestinationEvidenceSchema,
});
export type RestoredEngineReceipt = z.infer<typeof RestoredEngineReceiptSchema>;
export type RestoredEngineResult = {
	receiptId: string; sourceBytes: string; sourceDigest: string; record: RestoredEngineReceipt;
};
