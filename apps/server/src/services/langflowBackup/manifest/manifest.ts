import { z } from "zod";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const label = z.string().min(1);
const relativePath = label.refine(
	(value) =>
		!value.includes("\\") &&
		!value.includes("\0") &&
		value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
);

export const snapshotRoots = ["trellis", "engine", "secrets", "workspaces", "conversations"] as const;
export const manifestName = "paired-backup.json";
export const recoveryName = "restore-recovery.json";

export const SnapshotCompatibilitySchema = z.strictObject({
	trellisRelease: label,
	enginePackageDigest: digest,
	trellisDatabaseVersion: label,
	engineDatabaseVersion: label,
	secretVersion: label,
});

export const SnapshotMetadataSchema = z.strictObject({
	snapshotId: z.uuid(),
	sourceDataHomeId: label,
	sourceHostId: label,
	createdAt: z.iso.datetime(),
	compatibility: SnapshotCompatibilitySchema,
	boundary: z.strictObject({
		kind: z.literal("quiesced-export"),
		receiptId: label,
	}),
	unavailable: z.array(z.strictObject({ reference: label, reason: label })),
});

export const SnapshotManifestSchema = SnapshotMetadataSchema.extend({
	version: z.literal(1),
	capability: z.literal("langflow-paired-v1"),
	directories: z.array(relativePath),
	files: z.array(
		z.strictObject({
			path: relativePath,
			sha256: digest,
			size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
			executable: z.boolean(),
		}),
	),
});

export type SnapshotMetadata = z.infer<typeof SnapshotMetadataSchema>;
export type SnapshotManifest = z.infer<typeof SnapshotManifestSchema>;
export type SnapshotCompatibility = z.infer<typeof SnapshotCompatibilitySchema>;
