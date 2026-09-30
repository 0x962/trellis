import { z } from "zod";
import { protocolDigest } from "../../../../langflowContracts";

export const ReconciliationSourceSchema = z
	.strictObject({
		sourceBytes: z.string(),
		sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.refine((source) => protocolDigest(source.sourceBytes) === source.sourceDigest, {
		message: "reconciliation_source_digest_mismatch",
	});

export const ReconciliationFactsSchema = z.strictObject({
	migrations: ReconciliationSourceSchema,
	facts: ReconciliationSourceSchema,
});

export type ReconciliationSource = z.infer<typeof ReconciliationSourceSchema>;
export type ReconciliationFacts = z.infer<typeof ReconciliationFactsSchema>;
