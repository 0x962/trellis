import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";

export function providerOperation<T>(home: string, directory: string, action: () => Promise<T>): Promise<T> {
	return withRuntimeMutationExclusion(home, [{ kind: "provider", directory }], action);
}
