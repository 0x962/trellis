import { join } from "node:path";
import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";

export function withNativeSnapshotRetention<T>(home: string, action: () => Promise<T>) {
	return withRuntimeMutationExclusion(
		home,
		[{ kind: "attempt-retention", directory: join(home, "harness-attempts") }],
		action,
	);
}
