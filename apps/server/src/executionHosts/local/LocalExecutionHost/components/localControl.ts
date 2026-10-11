import { assertTarget } from "@trellis/runtime-protocol/execution";
import type { LocalExecutionHost, LocalHostDeps } from "../LocalExecutionHost.ts";

export const localControl = (deps: LocalHostDeps): Pick<LocalExecutionHost, "stop" | "terminal"> => {
	const client = () => deps.connection.client();
	return {
		stop: {
			async stop(target) {
				assertTarget(deps.binding, target);
				// A stop must reach a runtime that answers, so an absent runtime
				// starts and then confirms the exit from its saved record.
				return (await deps.connection.ensure()).stop(target.attemptId);
			},
			shutdown: () => client().shutdown(),
		},
		terminal: {
			channel(target, offset, signal) {
				assertTarget(deps.binding, target);
				return client().terminal(target.attemptId, offset, signal);
			},
			binaryChannel: async () => (await client().hello()).capabilities?.includes("terminal-channel") === true,
		},
	};
};
