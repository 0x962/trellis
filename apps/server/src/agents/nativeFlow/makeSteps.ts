import type { FlowDoc } from "@trellis/api";
import type { FlowStep } from "./types.ts";
export function makeSteps(
	doc: FlowDoc,
	parentId: string | null,
	parentKey: string | null,
	iteration: number,
): FlowStep[] {
	return doc.nodes
		.filter((node) => node.parentId === parentId)
		.map((node) => ({
			key: `${parentKey ?? "root"}/${iteration}/${node.id}`,
			nodeId: node.id,
			parentKey,
			iteration,
			round: 1,
			state: "pending",
			phase: "step",
			output: null,
			decision: null,
			error: null,
			startedAt: null,
			endedAt: null,
			deadlineAt: null,
			needsStop: false,
		}));
}
