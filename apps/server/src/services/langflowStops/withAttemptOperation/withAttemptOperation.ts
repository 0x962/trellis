import { join } from "node:path";
import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";

export function withAttemptOperation<T>(home: string, attemptId: string, action: () => Promise<T>) {
	return withRuntimeMutationExclusion(
		home,
		[{ kind: "attempt", directory: join(home, "harness-attempts", attemptId) }],
		action,
	);
}
