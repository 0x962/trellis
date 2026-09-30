import { realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeLaunchWriterScope } from "@trellis/runtime-protocol";
import { withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";
import type { HarnessDescriptor } from "../../../agents/harnessHost/types";

export async function withSessionNameScope<T>(
	home: string,
	source: HarnessDescriptor,
	attemptId: string,
	directory: string,
	action: (writerScopes: RuntimeLaunchWriterScope[] | undefined) => Promise<T>,
): Promise<T> {
	const workspace = { kind: "workspace" as const, directory: await realpath(directory) };
	const retained = source.spec.writerScopes?.filter((scope) =>
		scope.kind === "provider" || scope.kind === "repository");
	const writerScopes = retained === undefined ? undefined : [...retained, workspace];
	let entered = false;
	try {
		return await withRuntimeMutationExclusion(home, [
			...(writerScopes ?? [workspace]),
			{ kind: "attempt-retention", directory: join(home, "harness-attempts") },
			{ kind: "attempt", directory: join(home, "harness-attempts", source.spec.id) },
			{ kind: "attempt", directory: join(home, "harness-attempts", attemptId) },
		], () => {
			entered = true;
			return action(writerScopes);
		}, undefined, { unprovenWriter: writerScopes === undefined });
	} finally {
		if (!entered) await rm(directory, { recursive: true, force: true });
	}
}
