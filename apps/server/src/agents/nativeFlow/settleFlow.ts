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
		// A box with a time limit starts its clock when the first worker process
		// inside it starts. advanceFlow sets deadlineAt on that launch.
		state.steps.push(...makeSteps(doc, node.id, step.key, step.round));
	} else step.state = node.kind === "human" ? "waiting_human" : "ready";
}
// The steps inside a box in its current round.
const childrenOf = (state: FlowExecution, step: FlowStep) =>
	state.steps.filter((child) => child.parentKey === step.key && child.iteration === step.round);
export function settleFlow(doc: FlowDoc, state: FlowExecution, now: number): FlowExecution {
	const nodes = new Map(doc.nodes.map((node) => [node.id, node]));
	let changed = true;
	while (changed && !["failed", "canceled"].includes(state.status)) {
		changed = false;
		for (const step of state.steps) {
			const node = nodes.get(step.nodeId)!;
			if (step.state === "running" && step.phase === "children") {
				// A failed child fails its box with the same error, so the box and
				// the run name the cause before any step after the box starts.
				const failed = childrenOf(state, step).find((child) => child.state === "failed");
				if (failed) {
					step.state = "failed";
					step.error = failed.error;
					changed = true;
				}
			}
			if (step.state === "running" && step.deadlineAt !== null && now >= step.deadlineAt) {
				step.state = "failed";
				step.error = `Group ${node.title} reached its time limit (${node.minutes} min)`;
				state.failureKind = "error";
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
				const children = childrenOf(state, step);
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
	// A step keeps the time it became final. A step stored before `endedAt`
	// existed has no such key, so the loose check covers it.
	for (const step of state.steps) if (terminal.has(step.state) && step.endedAt == null) step.endedAt = now;
	state.updatedAt = now;
	return state;
}
