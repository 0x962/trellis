import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { OccurrenceV1Schema } from "../../../../../langflowContracts";
import type { ObservedOccurrence } from "../../../observation";
import { lifecycleFacts } from "../lifecycleFacts";

const metadata = z.strictObject({
	nodeId: z.string(),
	title: z.string(),
	instructions: z.string(),
	actionIdentity: z.string().min(1),
});
const row = z.looseObject({
	occurrence: OccurrenceV1Schema,
	metadata,
	projection: lifecycleFacts,
	resultReceiptIds: z.array(z.string().min(1)),
});
const deadlines = z.array(z.string().min(1));
const graph = z.looseObject({
	group_visit_scopes: z
		.record(z.string(), row.extend({ scope: z.looseObject({ groupDeadlineRefs: deadlines }) }))
		.optional(),
	group_scope_definitions: z
		.record(z.string(), z.looseObject({ groupNodeId: z.string(), scopeVertexId: z.string() }))
		.optional(),
	trellis_loop_visits: z
		.record(
			z.string(),
			z.looseObject({ loopNodeId: z.string(), groupDeadlineRefs: deadlines, history: z.array(row).min(1) }),
		)
		.optional(),
});
const publication = z.looseObject({
	nodes: z.array(
		z.looseObject({ id: z.string(), data: z.looseObject({ type: z.string(), node: z.unknown().optional() }) }),
	),
});

export function containerOccurrences(graphDocument: unknown, checkpoint: unknown): ObservedOccurrence[] {
	const saved = graph.parse(checkpoint);
	const archived = publication.parse(graphDocument);
	const result: ObservedOccurrence[] = [];
	const append = (visit: z.infer<typeof row>, vertexId: string, kind: "group" | "loop", deadlineRefs: string[]) => {
		const nodes = archived.nodes.filter((node) => node.id === vertexId);
		const className = kind === "group" ? "TrellisGroupScopeV1" : "TrellisLoopV1";
		if (nodes.length !== 1 || nodes[0]!.data.type !== className)
			throw new Error("projection_container_metadata_conflict");
		const original = z.looseObject({ trellis_metadata: metadata }).parse(nodes[0]!.data.node).trellis_metadata;
		if (!isDeepStrictEqual(original, visit.metadata) || original.nodeId !== visit.occurrence.nodeId)
			throw new Error("projection_container_metadata_conflict");
		result.push({
			...visit.occurrence,
			...visit.projection,
			kind,
			reviewArea: null,
			title: original.title,
			instruction: original.instructions,
			actionKey: original.actionIdentity,
			deadlineRefs,
		});
	};
	for (const [key, visit] of Object.entries(saved.group_visit_scopes ?? {})) {
		const definition = saved.group_scope_definitions?.[key];
		if (!definition || key !== visit.occurrence.occurrenceKey || definition.groupNodeId !== visit.occurrence.nodeId)
			throw new Error("projection_group_identity_conflict");
		append(visit, definition.scopeVertexId, "group", visit.scope.groupDeadlineRefs);
	}
	for (const loop of Object.values(saved.trellis_loop_visits ?? {})) {
		for (const visit of loop.history) {
			if (visit.occurrence.nodeId !== loop.loopNodeId) throw new Error("projection_loop_identity_conflict");
			append(visit, loop.loopNodeId, "loop", loop.groupDeadlineRefs);
		}
	}
	return result;
}
