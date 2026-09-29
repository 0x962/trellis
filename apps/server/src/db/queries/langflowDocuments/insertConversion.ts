import { createHash } from "node:crypto";
import {
	type DocumentConversionProvenance,
	langflowDocumentConversions,
} from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";

export const insertDocumentConversion = async (
	tx: Tx,
	input: {
		migrationId: string;
		flowId: string;
		sourceVersion: number;
		sourceBytes: Buffer;
		provenance: DocumentConversionProvenance;
		createdAt: Date;
	},
) => {
	const [record] = await tx
		.insert(langflowDocumentConversions)
		.values({
			...input,
			sourceDocumentHash: createHash("sha256").update(input.sourceBytes).digest("hex"),
		})
		.returning();
	return record!;
};
