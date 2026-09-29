import type { FlowDocumentV1 } from "@trellis/api";
import type { ServiceCtx } from "../../context.ts";
import {
	readLatestDocumentRevision,
	readDocumentRevision,
	readDocumentPublication,
	readLastDocumentPublication,
	readDocumentPublicationState,
} from "../../db/queries/langflowDocuments";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { resolveFlow } from "../flows/queries.ts";
import { legacySnapshot } from "./legacy.ts";

export const get = async (_ctx: ServiceCtx, tx: Tx, input: { flow: string }): Promise<FlowDocumentV1> => {
	const flow = await resolveFlow(tx, input.flow);
	const stored = await readDocumentRevision(tx, { flowId: flow.id, revision: flow.version });
	if (stored === undefined && (await readLatestDocumentRevision(tx, { flowId: flow.id })) !== undefined) {
		throw invalidInput("flow", "The current document revision is missing.");
	}
	const snapshot = stored?.snapshot ?? (await legacySnapshot(tx, flow));
	if (snapshot.engine === "legacy")
		return {
			...snapshot,
			publication: { state: "not_requested", revision: snapshot.revision },
			lastExecutablePublication: null,
		};
	const key = { flowId: flow.id, revision: snapshot.revision };
	const publication = await readDocumentPublication(tx, key);
	return {
		...snapshot,
		publication:
			publication === undefined
				? (await readDocumentPublicationState(tx, key)).state
				: { state: "published", revision: snapshot.revision, publication },
		lastExecutablePublication: (await readLastDocumentPublication(tx, { flowId: flow.id })) ?? null,
	};
};
