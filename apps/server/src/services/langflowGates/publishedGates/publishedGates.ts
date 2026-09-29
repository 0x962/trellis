import { z } from "zod";
import type { lockExecution } from "../../../db/queries/langflowExecution/executions";
import { readExecutionPublication } from "../../flowDocuments/readExecutionPublication";
import { protocolDigest, ReferenceSchema } from "../../../langflowContracts";

const gate = z.strictObject({ nodeId: ReferenceSchema, reviewArea: z.enum(["frontend", "backend"]) });
const graph = z.looseObject({
	trellisReviewGatesV1: z.record(z.string().min(1), gate),
	nodes: z.array(z.looseObject({
		id: z.string(),
		data: z.looseObject({ type: z.string() }),
	})),
});

export function publishedGates(execution: Awaited<ReturnType<typeof lockExecution>>) {
	const publication = readExecutionPublication(execution);
	const saved = graph.parse(publication.graphDocument);
	const entries = Object.entries(saved.trellisReviewGatesV1);
	if (new Set(entries.map(([, entry]) => entry.nodeId)).size !== entries.length)
		throw new Error("review_gate_node_conflict");
	return entries.map(([engineVertexId, entry]) => {
		const vertices = saved.nodes.filter((node) => node.id === engineVertexId);
		if (vertices.length !== 1 || vertices[0]!.data.type !== "TrellisReviewGateV1")
			throw new Error("review_gate_definition_conflict");
		return {
			engineVertexId,
			...entry,
			specHash: protocolDigest(JSON.stringify({ nodeId: entry.nodeId, reviewArea: entry.reviewArea })),
		};
	});
}
