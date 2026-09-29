import type { FlowAttemptV1, FlowExecutionRecord, FlowExecutionViewV1 } from "@trellis/api";

export type TerminalTarget = { task: FlowExecutionRecord["tasks"][number]; attempt?: FlowAttemptV1 };

export function currentTerminalTarget(
	execution: FlowExecutionRecord | FlowExecutionViewV1,
	target: TerminalTarget | null,
): TerminalTarget | null {
	if (!target?.attempt || !("snapshot" in execution)) return target;
	const selected = target.attempt;
	for (const occurrence of execution.occurrences) {
		const attempt = occurrence.attempts.find(
			(item) =>
				item.stepId === selected.stepId &&
				item.agentRunId === selected.agentRunId &&
				item.attemptId === selected.attemptId,
		);
		if (attempt) return { task: { ...target.task, resultId: attempt.resultId }, attempt };
	}
	return target;
}
