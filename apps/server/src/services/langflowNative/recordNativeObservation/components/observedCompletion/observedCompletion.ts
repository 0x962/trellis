import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import {
	NativeCompletionV1Schema,
	type NativeHandleV1,
	type NativeLaunchProvenanceV1,
	protocolDigest,
} from "../../../../../langflowContracts";

export function observedCompletion(input: {
	provenance: NativeLaunchProvenanceV1;
	handle: NativeHandleV1;
	runtime: RuntimeProcessStatus;
	run: { id: string; terminalId: string | null; sessionId: string | null };
}) {
	const { provenance, handle, runtime, run } = input;
	if (
		runtime.id !== handle.attemptId ||
		run.id !== handle.agentRunId ||
		run.terminalId !== handle.attemptId ||
		!runtime.agent?.sessionId ||
		run.sessionId !== runtime.agent.sessionId ||
		handle.providerSessionId !== runtime.agent.sessionId
	)
		return { state: "unknown" as const, reason: "attempt_mismatch" };
	if (runtime.status === "unknown" || (runtime.status === "running" && !runtime.controllable))
		return { state: "unknown" as const, reason: "attempt_unknown" };
	if (
		runtime.error !== null ||
		runtime.agent.error !== null ||
		runtime.agent.outcome === "failed" ||
		runtime.agent.outcome === "interrupted" ||
		(runtime.status === "exited" && runtime.exitCode !== 0)
	)
		return { state: "failed" as const, reason: "process_error" };
	if (runtime.status === "running" && runtime.activity?.state !== "idle") return { state: "waiting_native" as const };
	if (!runtime.result || !runtime.acknowledgedMessageIds.includes(handle.attemptId))
		return { state: "unknown" as const, reason: "prompt_or_result_missing" };
	const request = provenance.request;
	const completion = NativeCompletionV1Schema.parse({
		version: 1,
		provenance,
		handle,
		result: {
			version: 1,
			launchBinding: {
				executionId: request.executionId,
				publicationId: request.publicationId,
				engineJobId: request.engineJobId,
				engineEpoch: request.engineEpoch,
			},
			requestDigest: provenance.requestDigest,
			completionId: `completion:${protocolDigest(JSON.stringify([handle.attemptId, runtime.result.id]))}`,
			stepId: handle.stepId,
			agentRunId: handle.agentRunId,
			attemptId: handle.attemptId,
			providerSessionId: runtime.agent.sessionId,
			promptReceiptId: handle.attemptId,
			resultId: runtime.result.id,
			resultVersion: 1,
			output: runtime.result.text,
			outputHash: protocolDigest(runtime.result.text),
			artifactRefs: [],
			exitKind: "completed",
		},
	});
	return { state: "completed" as const, completion, resultBytes: JSON.stringify(completion.result) };
}
