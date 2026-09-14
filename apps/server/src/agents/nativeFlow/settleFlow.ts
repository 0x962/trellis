import type { FlowDoc, FlowNode } from "@trellis/api";
import { makeSteps } from "./makeSteps.ts";
import type { FlowExecution, FlowStep } from "./types.ts";

const terminal = new Set(["succeeded", "skipped", "failed", "canceled"]);
function skip(doc: FlowDoc, state: FlowExecution, step: FlowStep) {
	step.state = "skipped";
	const children = makeSteps(doc, step.nodeId, step.key, step.round);
	state.steps.push(...children);
	for (const child of children) skip(doc, state, child);
}
function activate(doc: FlowDoc, state: FlowExecution, step: FlowStep, node: FlowNode, now: number) {
	if (node.kind === "group" || node.kind === "loop") {
		step.state = "running";
		step.phase = "children";
		step.startedAt = now;
		step.deadlineAt = node.minutes === null ? null : now + node.minutes * 60000;
		state.steps.push(...makeSteps(doc, node.id, step.key, step.round));
	} else step.state = node.kind === "human" ? "waiting_human" : "ready";
}
export function settleFlow(doc: FlowDoc, state: FlowExecution, now: number): FlowExecution {
	const nodes = new Map(doc.nodes.map((node) => [node.id, node]));
	let changed = true;
	while (changed && !["failed", "canceled"].includes(state.status)) {
		changed = false;
		for (const step of state.steps) {
			const node = nodes.get(step.nodeId)!;
			if (step.state === "running" && step.deadlineAt !== null && now >= step.deadlineAt) {
				step.state = "failed";
				step.error = `Group ${node.title} reached its time limit`;
				changed = true;
			}
			if (step.state === "failed") {
				state.status = "failed";
				state.error = step.error;
				break;
			}
			if (step.state === "pending") {
				const parent =
					step.parentKey === null ? null : state.steps.find((candidate) => candidate.key === step.parentKey)!;
				if (parent && (parent.state !== "running" || parent.phase !== "children" || parent.round !== step.iteration))
					continue;
				const incoming = doc.edges.filter((edge) => edge.toNodeId === node.id);
				const sources = incoming.map((edge) => ({
					edge,
					source: state.steps.find(
						(candidate) =>
							candidate.nodeId === edge.fromNodeId &&
							candidate.parentKey === step.parentKey &&
							candidate.iteration === step.iteration,
					)!,
				}));
				if (!sources.every(({ source }) => terminal.has(source.state))) continue;
				if (
					sources.length > 0 &&
					!sources.some(
						({ edge, source }) =>
							source.state === "succeeded" && (edge.branch === "out" || source.decision === edge.branch),
					)
				)
					skip(doc, state, step);
				else activate(doc, state, step, node, now);
				changed = true;
			}
			if (step.state === "running" && step.phase === "children") {
				const children = state.steps.filter((child) => child.parentKey === step.key && child.iteration === step.round);
				if (!children.every((child) => terminal.has(child.state))) continue;
				step.output = children
					.filter((child) => child.state === "succeeded" && child.output !== null)
					.map((child) => child.output)
					.join("\n\n");
				if (node.kind === "loop") {
					step.phase = "condition";
					step.state = "ready";
				} else step.state = "succeeded";
				changed = true;
			}
		}
	}
	if (state.status === "failed" || state.status === "canceled") {
		for (const step of state.steps) {
			if (terminal.has(step.state)) continue;
			step.needsStop = (step.state === "running" || step.state === "unknown") && step.phase !== "children";
			step.state = "canceled";
		}
	} else {
		const roots = state.steps.filter((step) => step.parentKey === null);
		state.status = roots.every((step) => terminal.has(step.state))
			? "succeeded"
			: state.steps.some((step) => step.state === "ready" || (step.state === "running" && step.phase !== "children"))
				? "running"
				: "waiting";
	}
	state.updatedAt = now;
	return state;
}
