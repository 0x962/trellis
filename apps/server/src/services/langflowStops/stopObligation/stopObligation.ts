import { randomUUID } from "node:crypto";
import type { NativeHandleV1, StopObligationV1 } from "../../../langflowContracts";

export function stopObligation(input: {
	executionId: string;
	handle: NativeHandleV1;
	reason: StopObligationV1["reason"];
	now: Date;
}): StopObligationV1 {
	return {
		version: 1,
		obligationId: randomUUID(),
		executionId: input.executionId,
		stepId: input.handle.stepId,
		agentRunId: input.handle.agentRunId,
		attemptId: input.handle.attemptId,
		reason: input.reason,
		requestedAt: input.now.toISOString(),
		revision: 1,
		state: "pending",
		exitReceipt: null,
	};
}
