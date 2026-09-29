import { isDeepStrictEqual } from "node:util";
import type { FlowDocumentSnapshotV1 } from "@trellis/api";
import { z } from "zod";
import type { GroupDeadlineScope } from "../../../groupDeadlineContract";

const graph = z.object({ nodes: z.array(z.object({ id: z.string(), data: z.unknown() })) });
const scopeData = z.object({
	type: z.literal("TrellisGroupScopeV1"),
	node: z.object({ template: z.object({ scope_definition: z.object({ value: z.string() }) }) }),
});
const definition = z.object({
	version: z.literal(1),
	groupNodeId: z.string(),
	scopeVertexId: z.string(),
	minutes: z.int().positive(),
});

export function groupBudget(snapshot: FlowDocumentSnapshotV1, input: GroupDeadlineScope) {
	if (snapshot.engine !== "langflow") throw new Error("group_publication_conflict");
	const nodes = graph.parse(snapshot.graphDocument).nodes.filter((node) => node.id === input.scopeVertexId);
	if (nodes.length !== 1) throw new Error("group_scope_missing");
	const data = scopeData.parse(nodes[0]!.data);
	const frozen = JSON.parse(data.node.template.scope_definition.value);
	if (!isDeepStrictEqual(frozen, input.groupDefinition)) throw new Error("group_definition_conflict");
	const group = definition.parse(frozen);
	if (group.scopeVertexId !== input.scopeVertexId || group.groupNodeId !== input.occurrence.nodeId)
		throw new Error("group_scope_conflict");
	return z
		.int()
		.positive()
		.parse(group.minutes * 60_000);
}
