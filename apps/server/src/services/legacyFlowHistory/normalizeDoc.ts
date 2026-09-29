import type { FlowDoc } from "@trellis/api";

// Historical snapshots can omit harness and project fields. Null preserves their shared defaults.
export const normalizeDoc = (doc: FlowDoc): FlowDoc => ({
	...doc,
	flow: { ...doc.flow, harness: doc.flow.harness ?? null, project: doc.flow.project ?? null },
	nodes: doc.nodes.map((node) => ({ ...node, harness: node.harness ?? null })),
});
