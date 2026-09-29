import type { FlowExecutionRecord, FlowOccurrenceV1 } from "@trellis/api";
import { actionKey } from "./actionKey.ts";

const time = (value: number | null | undefined) => (value == null ? null : new Date(value).toISOString());

export const occurrences = (record: FlowExecutionRecord): FlowOccurrenceV1[] => {
	const nodes = new Map(record.doc.nodes.map((node) => [node.id, node]));
	const steps = new Map(record.state.steps.map((step) => [step.key, step]));
	const tasks = new Map<string, FlowExecutionRecord["tasks"]>();
	for (const task of record.tasks) {
		const key = task.key.slice(0, task.key.lastIndexOf(":", task.key.lastIndexOf(":") - 1));
		const found = tasks.get(key) ?? [];
		found.push(task);
		tasks.set(key, found);
	}
	return record.state.steps.map((step) => {
		const node = nodes.get(step.nodeId)!;
		const iterationPath: FlowOccurrenceV1["iterationPath"] = [];
		let child = step;
		if (node.kind === "loop") iterationPath.push({ loopNodeId: node.id, round: step.round });
		while (child.parentKey !== null) {
			const parent = steps.get(child.parentKey)!;
			if (nodes.get(parent.nodeId)!.kind === "loop") {
				iterationPath.unshift({ loopNodeId: parent.nodeId, round: child.iteration });
			}
			child = parent;
		}
		const result = (tasks.get(step.key) ?? []).find((task) => task.key === actionKey(step));
		return {
			kind: node.kind,
			outputSource:
				step.output !== null && result?.resultId != null
					? {
							stepId: result.key,
							agentRunId: result.runId,
							attemptId: result.attemptId,
							resultId: result.resultId,
						}
					: null,
			nodeId: step.nodeId,
			occurrenceKey: step.key,
			parentOccurrenceKey: step.parentKey,
			phase: step.phase,
			iterationPath,
			title: node.title,
			instruction: node.instruction,
			actionKey: actionKey(step),
			state: step.state,
			waitReason: step.state === "waiting_human" ? "human" : step.state === "unknown" ? "ownership_unknown" : null,
			output: step.output,
			decision: step.decision,
			error: step.error,
			skipReason: null,
			startedAt: time(step.startedAt),
			endedAt: time(step.endedAt),
			deadlineRefs: [],
			attempts: (tasks.get(step.key) ?? []).map((task) => ({
				stepId: task.key,
				agentRunId: task.runId,
				attemptId: task.attemptId,
				resultId: task.resultId,
				workspaceId: null,
				workspaceCommit: null,
				providerSessionId: null,
				state: "unknown",
				launchedAt: null,
			})),
		};
	});
};
