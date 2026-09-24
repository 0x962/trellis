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
	} else if (event.type === "launched") {
		const step = state.steps.find((step) => taskKey(step) === event.key);
		if (!step || !["running", "unknown"].includes(step.state) || step.phase === "children") return state;
		// The step counts its time from the moment its process exists. Each box
		// around it with a time limit and no clock yet starts its clock now.
		if (step.phase === "step") step.startedAt = event.at;
		let parentKey = step.parentKey;
		while (parentKey !== null) {
			const parent = state.steps.find((candidate) => candidate.key === parentKey)!;
			const box = doc.nodes.find((node) => node.id === parent.nodeId)!;
			if (box.minutes !== null && parent.deadlineAt === null) parent.deadlineAt = event.at + box.minutes * 60000;
			parentKey = parent.parentKey;
		}
	} else if (event.type === "warned") {
		const step = state.steps.find((step) => taskKey(step) === event.key);
		if (step && ["running", "unknown"].includes(step.state)) step.timeWarnings = event.count;
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
			if (!event.approved) {
				step.error = `Human rejected ${node.title}: ${event.output}`;
				state.failureKind = "feedback";
			}
		} else if ((step.state === "running" || step.state === "unknown") && step.phase !== "children") {
			if (event.type === "unknown" || event.type === "fail") {
				step.state = event.type === "unknown" ? "unknown" : "failed";
				step.error = event.error;
				if (event.type === "fail") state.failureKind = "error";
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
						state.failureKind = "feedback";
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
