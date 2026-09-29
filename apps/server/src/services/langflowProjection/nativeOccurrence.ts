import { isDeepStrictEqual } from "node:util";
import type { FlowAttemptV1, FlowOccurrenceV1 } from "@trellis/api";
import { nativeGateDecision } from "../langflowGates";
import type { NativeProjectionFact } from "./facts.ts";
import type { ObservedOccurrence } from "./observation.ts";

export function nativeOccurrence(
	observed: ObservedOccurrence,
	base: FlowOccurrenceV1,
	facts: NativeProjectionFact[],
): FlowOccurrenceV1 {
	const attempts: FlowAttemptV1[] = facts.map(({ provenance, handle, launchReceipt, completion }) => ({
		stepId: provenance.stepId,
		agentRunId: provenance.agentRunId,
		attemptId: provenance.attemptId,
		workspaceId: handle.workspaceId,
		workspaceCommit:
			base.attempts.find((attempt) => attempt.attemptId === provenance.attemptId)?.workspaceCommit ?? null,
		providerSessionId: handle.providerSessionId,
		state: handle.state === "unknown" ? "unknown" : completion ? "exited" : launchReceipt ? "launched" : "reserved",
		launchedAt: launchReceipt?.launchedAt ?? null,
		resultId: completion?.completion.result.resultId ?? null,
	}));
	const accepted = facts.find((fact) => {
		const saved = fact.completion;
		if (!saved?.receipt) return false;
		const { result } = saved.completion;
		return (
			result.completionId === observed.acceptedResultId &&
			saved.receipt.completionId === result.completionId &&
			saved.receipt.executionId === result.launchBinding.executionId &&
			saved.receipt.engineJobId === result.launchBinding.engineJobId &&
			saved.receipt.resultDigest === saved.resultDigest
		);
	});
	const retained = facts.findLast((fact) => fact.completion !== null);
	const completed = accepted?.completion ?? retained?.completion;
	const result = completed?.completion.result;
	const decision =
		accepted && result?.exitKind === "completed" && (observed.kind === "gate" || observed.phase === "condition")
			? nativeGateDecision(result)
			: base.decision;
	const invalidGate =
		observed.state === "succeeded" &&
		(observed.kind === "gate" || observed.phase === "condition") &&
		(decision === null || decision === "unknown");
	const state =
		observed.state === "succeeded"
			? !accepted
				? "unknown"
				: result?.exitKind !== "completed" || invalidGate
					? "failed"
					: "succeeded"
			: observed.state === "skipped" && facts.length > 0
				? "unknown"
				: observed.state;
	const unknown =
		facts.some((fact) => fact.handle.state === "unknown") || (facts.length === 0 && observed.state === "running");
	const outputSource = result
		? {
				stepId: result.stepId,
				agentRunId: result.agentRunId,
				attemptId: result.attemptId,
				resultId: result.resultId,
			}
		: base.outputSource;
	if (base.outputSource && outputSource && !isDeepStrictEqual(base.outputSource, outputSource)) {
		throw new Error("receipt_mismatch");
	}
	return {
		...base,
		attempts,
		state: unknown && state !== "failed" && state !== "canceled" ? "unknown" : state,
		waitReason: unknown || state === "unknown" ? "ownership_unknown" : state === "running" ? "native" : null,
		output: result?.output ?? base.output,
		outputSource,
		decision: decision === "unknown" ? null : decision,
		endedAt: ["succeeded", "skipped", "failed", "canceled"].includes(state) ? base.endedAt : null,
		startedAt: attempts.find((attempt) => attempt.launchedAt !== null)?.launchedAt ?? base.startedAt,
	};
}
