import type { FlowPublicationStateV1 } from "@trellis/api";
import { and, eq } from "drizzle-orm";
import { langflowDocumentPublicationStates } from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";
import { readDocumentPublication } from "./readPublication.ts";

export const readDocumentPublicationState = async (
	tx: Tx,
	input: { flowId: string; revision: number },
): Promise<{
	version: number;
	state: FlowPublicationStateV1;
}> => {
	const [row] = await tx
		.select()
		.from(langflowDocumentPublicationStates)
		.where(
			and(
				eq(langflowDocumentPublicationStates.flowId, input.flowId),
				eq(langflowDocumentPublicationStates.revision, input.revision),
			),
		);
	const publication = await readDocumentPublication(tx, input);
	return {
		version: row!.version,
		state: publication === undefined ? row!.state : { state: "published", revision: input.revision, publication },
	};
};
