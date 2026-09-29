import { and, eq } from "drizzle-orm";
import {
	langflowDocumentPublicationStates,
	langflowDocumentRevisions,
	type UnpublishedDocumentState,
} from "../../tables/langflowDocuments/index.ts";
import type { Tx } from "../../tx.ts";
import { readDocumentPublicationState } from "./readPublicationState.ts";

// Publication and progress updates lock the same revision. A completed publication
// therefore wins over a delayed failure response for that revision.
export const writeDocumentPublicationState = async (
	tx: Tx,
	input: {
		flowId: string;
		revision: number;
		expectedVersion: number;
		state: UnpublishedDocumentState;
	},
) => {
	await tx
		.select({ revision: langflowDocumentRevisions.revision })
		.from(langflowDocumentRevisions)
		.where(
			and(eq(langflowDocumentRevisions.flowId, input.flowId), eq(langflowDocumentRevisions.revision, input.revision)),
		)
		.for("update");
	const current = await readDocumentPublicationState(tx, input);
	if (current.state.state === "published")
		return { state: "published" as const, publication: current.state.publication };
	if (current.version !== input.expectedVersion) return { state: "conflict" as const, version: current.version };
	const version = current.version + 1;
	await tx
		.update(langflowDocumentPublicationStates)
		.set({ version, state: input.state })
		.where(
			and(
				eq(langflowDocumentPublicationStates.flowId, input.flowId),
				eq(langflowDocumentPublicationStates.revision, input.revision),
				eq(langflowDocumentPublicationStates.version, input.expectedVersion),
			),
		);
	return { state: "updated" as const, version };
};
