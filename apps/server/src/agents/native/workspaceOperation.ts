import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";

export function workspaceOperation<T>(home: string, directory: string, action: () => Promise<T>): Promise<T> {
	return withRuntimeMutationExclusion(home, [{ kind: "workspace", directory }], action);
}
