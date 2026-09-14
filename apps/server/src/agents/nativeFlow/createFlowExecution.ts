import { type FlowDoc, validateFlowGraph } from "@trellis/api";
import { makeSteps } from "./makeSteps.ts";
import { settleFlow } from "./settleFlow.ts";
import type { FlowExecution } from "./types.ts";
export function createFlowExecution(doc: FlowDoc, now: number): FlowExecution {
	const issues = validateFlowGraph(doc, "run");
	if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join("\n"));
	return settleFlow(
		doc,
		{
			version: 1,
			flowId: doc.flow.id,
			flowVersion: doc.flow.version,
			status: "running",
			startedAt: now,
			updatedAt: now,
			error: null,
			steps: makeSteps(doc, null, null, 1),
		},
		now,
	);
}
