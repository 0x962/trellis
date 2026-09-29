import { z } from "zod";
import { SnapshotCompatibilitySchema } from "../../../manifest/manifest";

const EngineSnapshotBindingSchema = z.strictObject({
	snapshotId: z.uuid(),
	sourceDataHomeId: z.string().min(1),
	sourceHostId: z.string().min(1),
	boundaryReceiptId: z.string().min(1),
	compatibility: SnapshotCompatibilitySchema,
});
const file = z.strictObject({
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export const EngineSnapshotReceiptSchema = z.strictObject({
	version: z.literal(1),
	binding: EngineSnapshotBindingSchema,
	database: file,
	secret: file,
	revisions: z.array(z.string().min(1)),
	tables: z.array(z.string().min(1)),
});
