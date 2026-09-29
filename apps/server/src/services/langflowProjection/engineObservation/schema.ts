import { z } from "zod";
import { DigestSchema, RevisionSchema } from "../../../langflowContracts";
export { EngineProjectionSnapshotV1Schema, type EngineProjectionSnapshotV1 } from "../../../langflowContracts/projection";

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

export type EngineProjectionResponseV1 = z.infer<typeof EngineProjectionResponseV1Schema>;
