import { ORPCError } from "@orpc/client";
import type { RunnerReason } from "@trellis/api";
import { runnerReasonLine } from "../runnerReasonLine";

// What to say when a start the person asked for did not happen. A runner
// refusal names its reason; any other error shows its own message.
export const runnerRefusal = (error: unknown): string => {
	if (error instanceof ORPCError && error.code === "RUNNER_UNAVAILABLE") {
		return runnerReasonLine[(error.data as { reason: RunnerReason }).reason];
	}
	return (error as Error).message;
};
