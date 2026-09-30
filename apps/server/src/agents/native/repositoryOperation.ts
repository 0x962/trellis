import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";

export function repositoryOperation<T>(home: string, directory: string, action: () => Promise<T>): Promise<T> {
	return withRuntimeMutationExclusion(home, [{ kind: "repository", directory }], action);
}
