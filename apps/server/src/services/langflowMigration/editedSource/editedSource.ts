import { FlowDigestV1Schema } from "@trellis/api";
import { z } from "zod";

export const EditedSourceV1Schema = z.strictObject({
	schemaVersion: z.literal(1),
	revision: z.number().int().positive(),
	sha256: FlowDigestV1Schema,
	bytesBase64: z.string(),
	derivedFrom: z.strictObject({
		revision: z.number().int().positive(),
		documentHash: FlowDigestV1Schema,
		sourceHash: FlowDigestV1Schema,
	}),
	intent: z.strictObject({ requestId: z.uuid(), sha256: FlowDigestV1Schema, bytesBase64: z.string() }),
});

export type EditedSourceV1 = z.infer<typeof EditedSourceV1Schema>;
