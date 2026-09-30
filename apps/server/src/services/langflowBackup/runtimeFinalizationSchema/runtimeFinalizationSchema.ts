import { z } from "zod";
import { WorkspaceBindingSchema } from "../workspaceArchive/contracts/contracts";

export const RuntimeCaptureRequestSchema = WorkspaceBindingSchema.omit({ workspaces: true, roots: true });
const receipt = z.strictObject({
	schemaVersion: z.literal(1),
	kind: z.literal("trellis-runtime-capture-finalization"),
	request: RuntimeCaptureRequestSchema,
	requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
	outcome: z.enum(["committed", "abandoned"]),
	finalizedAt: z.iso.datetime(),
});
export const RuntimeFinalizationSchema = z.strictObject({ receipt, receiptBytes: z.string() });
