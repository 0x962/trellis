import type { FlowDoc } from "@trellis/api";
import { makeSteps } from "./makeSteps.ts";
import { settleFlow } from "./settleFlow.ts";
import { taskKey } from "./taskKey.ts";
import type { FlowEvent, FlowExecution } from "./types.ts";
export function advanceFlow(doc: FlowDoc, previous: FlowExecution, event: FlowEvent, now: number): FlowExecution {
	const state = structuredClone(previous);
	if (event.type === "stopped") {
		const step = state.steps.find((step) => taskKey(step) === event.key);
		if (step) step.needsStop = false;
		return settleFlow(doc, state, now);
	}
	if (["failed", "canceled", "succeeded"].includes(state.status)) return state;
	if (event.type === "cancel") {
		state.status = "canceled";
		state.error = event.reason;
	} else if (event.type !== "tick") {
		const step = state.steps.find((step) => taskKey(step) === event.key);
		if (!step) return state;
		const node = doc.nodes.find((node) => node.id === step.nodeId)!;
		if (event.type === "started" && step.state === "ready") {
			step.state = "running";
			step.startedAt ??= now;
		} else if (event.type === "human" && step.state === "waiting_human") {
			step.output = event.output;
			step.state = event.approved ? "succeeded" : "failed";
			if (!event.approved) step.error = `Human rejected ${node.title}: ${event.output}`;
		} else if ((step.state === "running" || step.state === "unknown") && step.phase !== "children") {
			if (event.type === "unknown" || event.type === "fail") {
				step.state = event.type === "unknown" ? "unknown" : "failed";
				step.error = event.error;
			} else if (event.type === "complete") {
				if ((node.kind === "gate" || step.phase === "condition") && event.decision === undefined)
					throw new Error(`A decision is required for ${node.title}`);
				step.output = event.output;
				step.decision = event.decision ?? null;
				step.error = null;
				if (step.phase === "condition" && event.decision === "no") {
					if (step.round >= node.maxRounds!) {
						step.state = "failed";
						step.error = `Loop ${node.title} reached its round limit (${node.maxRounds})`;
					} else {
						step.round++;
						step.phase = "children";
						step.state = "running";
						state.steps.push(...makeSteps(doc, node.id, step.key, step.round));
					}
				} else step.state = "succeeded";
			}
		}
	}
	return settleFlow(doc, state, now);
}
