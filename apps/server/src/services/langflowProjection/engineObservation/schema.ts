import { z } from "zod";
import {
	DigestSchema,
	EngineJobBindingV1Schema,
	RevisionSchema,
	TimestampSchema,
} from "../../../langflowContracts";

export const EngineProjectionSnapshotV1Schema = z.strictObject({
	version: z.literal(1),
	...EngineJobBindingV1Schema.shape,
	sourceCursor: RevisionSchema,
	capturedAt: TimestampSchema,
	checkpointBytes: z.string().min(1),
	graphCheckpointBytes: z.string().min(1),
	occurrenceJournalBytes: z.string().nullable(),
	jobStatus: z.string().min(1),
	jobOutcomeBytes: z.string().nullable(),
});

const record = {
	authorityDigest: DigestSchema,
	sourceCursor: RevisionSchema,
	snapshotBytes: z.string().min(1),
	snapshotDigest: DigestSchema,
	sourceBytes: z.string().min(1),
	sourceDigest: DigestSchema,
};

export const EngineProjectionResponseV1Schema = z.discriminatedUnion("state", [
	z.strictObject({ state: z.literal("snapshot"), ...record }),
	z.strictObject({ state: z.literal("gap"), ...record }),
	z.strictObject({ state: z.literal("unchanged"), authorityDigest: DigestSchema, sourceCursor: z.int().nonnegative() }),
	z.strictObject({
		state: z.literal("unavailable"),
		authorityDigest: DigestSchema,
		reason: z.enum(["projection_checkpoint_missing", "projection_epoch_not_recorded"]),
	}),
]);

export type EngineProjectionSnapshotV1 = z.infer<typeof EngineProjectionSnapshotV1Schema>;
export type EngineProjectionResponseV1 = z.infer<typeof EngineProjectionResponseV1Schema>;
