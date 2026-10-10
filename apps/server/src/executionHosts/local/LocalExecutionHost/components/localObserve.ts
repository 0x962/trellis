import { assertTarget } from "@trellis/runtime-protocol/execution";
import { nativeHost } from "../../../../agents/native/harnessHost.ts";
import type { LocalExecutionHost, LocalHostDeps } from "../LocalExecutionHost.ts";

export const localObserve = (deps: LocalHostDeps): Pick<LocalExecutionHost, "health" | "observe"> => {
	const client = () => deps.connection.client();
	return {
		health: {
			hello: (signal) => client().hello(signal),
		},
		observe: {
			async inspect(target) {
				assertTarget(deps.binding, target);
				return client().inspect(target.attemptId);
			},
			async recover(target) {
				assertTarget(deps.binding, target);
				return client().recover(target.attemptId);
			},
			list: (input = {}, signal) => client().list(input, signal),
			session(target, signal) {
				assertTarget(deps.binding, target);
				return client().subscribeSession(target.attemptId, signal);
			},
			async waitFor(target, matches, options) {
				assertTarget(deps.binding, target);
				return nativeHost(deps.home, undefined, client(), deps.log).waitFor(target.attemptId, matches, options);
			},
		},
	};
};
