import type { FlowDoc, FlowHarness, FlowNode } from "@trellis/api";

// The harness a step launches with: its own, else the harness of its flow,
// else claude. An execution reads its frozen doc, so a step of a run that
// started before the flow changed keeps the values of that time.
export function stepHarness(doc: Pick<FlowDoc, "flow">, node: Pick<FlowNode, "harness">): FlowHarness {
	return node.harness ?? doc.flow.harness ?? { preset: "claude" };
}
