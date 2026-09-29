import { FlowDigestV1Schema, UlidSchema } from "@trellis/api";
import { z } from "zod";
import type { BlockedMigrationV1 } from "../types";

export const ConversionAssociationSchema = z.strictObject({
	sourceNodeId: UlidSchema,
	engineNodeId: z.string().min(1),
	definitionId: z.string().min(1),
	phase: z.enum(["step", "children", "condition"]),
	specNamespace: z.enum(["trellisRequestSpecsV1", "trellisReviewGatesV1"]),
});

export const ConversionBindingSchema = ConversionAssociationSchema.extend({
	sourceNodeHash: FlowDigestV1Schema,
	specHash: FlowDigestV1Schema,
});

export const ConversionEnvelopeSchema = z.strictObject({
	schemaVersion: z.literal(1),
	source: z.strictObject({
		flowId: UlidSchema,
		version: z.number().int().positive(),
		sha256: FlowDigestV1Schema,
		bytesBase64: z.string(),
	}),
	componentManifestHash: FlowDigestV1Schema,
	nodeSpecs: z.array(ConversionBindingSchema),
});

export const ConversionExpansionSchema = z.strictObject({
	graphDocument: z.record(z.string(), z.json()),
	nodeSpecs: z.array(ConversionAssociationSchema),
});

export type ConversionAssociationV1 = z.infer<typeof ConversionAssociationSchema>;
export type ConversionBindingV1 = z.infer<typeof ConversionBindingSchema>;
export type ConversionEnvelopeV1 = z.infer<typeof ConversionEnvelopeSchema>;
export type ConversionExpansionV1 = z.infer<typeof ConversionExpansionSchema>;
export type BlockedConversionIntakeV1 = {
	state: "blocked";
	record: BlockedMigrationV1;
	expansion: { sha256: string; exportRef: string };
	candidate: { sha256: string; exportRef: string } | null;
};
