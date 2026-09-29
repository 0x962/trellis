import type { FlowDocumentSaveV1Input } from "@trellis/api";
import { z } from "zod";

export type DraftContent = {
	[Engine in FlowDocumentSaveV1Input["engine"]]: Omit<
		Extract<FlowDocumentSaveV1Input, { engine: Engine }>,
		"flow" | "expectedVersion" | "requestId"
	>;
}[FlowDocumentSaveV1Input["engine"]];

export const DraftIdentitySchema = z.strictObject({
	host: z.string().min(1),
	actor: z.string().min(1),
	flow: z.string().min(1),
	tab: z.string().min(1),
});
export type DraftIdentity = z.infer<typeof DraftIdentitySchema>;

export const DraftRecordSchema = z.strictObject({
	version: z.literal(1),
	identity: DraftIdentitySchema,
	baseVersion: z.number().int().positive(),
	updatedAt: z.iso.datetime(),
	contentJson: z.string(),
	savedContentJson: z.string(),
	legacyBytes: z.string().nullable(),
	submission: z.strictObject({ requestJson: z.string(), contentJson: z.string() }).nullable(),
	blocked: z.enum(["conflict", "unsupported"]).nullable(),
});
export type DraftRecord = z.infer<typeof DraftRecordSchema>;
