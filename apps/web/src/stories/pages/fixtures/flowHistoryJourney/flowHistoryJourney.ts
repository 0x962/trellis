import type { FlowExecutionRecord } from "@trellis/api";
import {
	decisionStepKey,
	flowExecution,
	flowHistoryResponses,
	flowTaskRun,
	replacementAttemptId,
	replacementFlowTaskRun,
} from "../flowHistory";
import { id } from "../project";

export function flowHistoryJourney(failDecision = false) {
	let executions = [structuredClone(flowExecution)];
	let taskRun = structuredClone(flowTaskRun);
	let rejectNextDecision = failDecision;
	const update = (id: string, status: "succeeded" | "failed" | "canceled", output: string | null) => {
		const current = executions.find((execution) => execution.id === id)!;
		const next: FlowExecutionRecord = {
			...current,
			revision: current.revision + 1,
			state: {
				...current.state,
				status,
				updatedAt: current.state.updatedAt + 1000,
				steps: current.state.steps.map((step) =>
					step.state !== "waiting_human"
						? step
						: {
								...step,
								state: status,
								output,
								endedAt: current.state.updatedAt + 1000,
							},
				),
			},
		};
		executions = executions.map((execution) => (execution.id === id ? next : execution));
		return next;
	};
	return {
		reset() {
			executions = [structuredClone(flowExecution)];
			taskRun = structuredClone(flowTaskRun);
			rejectNextDecision = failDecision;
		},
		replaceAttempt() {
			taskRun = structuredClone(replacementFlowTaskRun);
			executions = executions.map((execution) => ({
				...execution,
				revision: execution.revision + 1,
				tasks: execution.tasks.map((task) => ({ ...task, attemptId: replacementAttemptId })),
			}));
		},
		responses: {
			...flowHistoryResponses,
			"flowExecutions.list": () => executions,
			"agentRuns.list": () => ({ items: [taskRun], nextCursor: null }),
			"flowExecutions.cancel": (input: unknown) => update((input as { id: string }).id, "canceled", null),
			"flowExecutions.decide": (input: unknown) => {
				const decision = input as { id: string; key: string; approved: boolean; output: string };
				if (decision.key !== decisionStepKey) throw new Error("The fixture expects the human decision key.");
				if (rejectNextDecision) {
					rejectNextDecision = false;
					throw new Error("The synthetic decision request fails once.");
				}
				return update(decision.id, decision.approved ? "succeeded" : "failed", decision.output);
			},
			"flowExecutions.start": () => {
				const next: FlowExecutionRecord = {
					...structuredClone(flowExecution),
					id: id(570 + executions.length),
					repeatOf: executions[0]!.id,
					repeatReason: "Repeat the review after the completed run.",
				};
				executions = [next, ...executions];
				return next;
			},
		},
	};
}
