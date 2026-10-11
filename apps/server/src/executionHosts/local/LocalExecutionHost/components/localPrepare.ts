import { assertTarget, redactLaunchSpec } from "@trellis/runtime-protocol/execution";
import { customLaunch } from "../../../../agents/native/customLaunch.ts";
import { nativeWorkspace } from "../../../../agents/native/workspace.ts";
import { definedEnvironment } from "../../../../executionEnvironment/executionEnvironment.ts";
import { localAttemptEnvironment } from "../../LocalAttemptEnvironment";
import type { LocalExecutionHost, LocalHostDeps } from "../LocalExecutionHost.ts";
import { prepareHost } from "./prepareHost.ts";
import { redactDescriptor } from "./redactDescriptor.ts";

export const localPrepare = (deps: LocalHostDeps): Pick<LocalExecutionHost, "prepare"> => ({
	prepare: {
		async workspace(target, { run, directory }) {
			assertTarget(deps.binding, target);
			return { workspaceId: await nativeWorkspace(deps.home, run, directory, { environment: deps.env }) };
		},
		async descriptor(target, input) {
			assertTarget(deps.binding, target);
			const { host, launch, sessionId } = await prepareHost(deps, target, input);
			return redactDescriptor(await host.prepare(launch, sessionId));
		},
		async custom(target, input) {
			assertTarget(deps.binding, target);
			const env = { ...definedEnvironment(await deps.env()), ...localAttemptEnvironment(deps, target, input.token) };
			return redactLaunchSpec(
				await customLaunch(deps.home, {
					id: target.attemptId,
					command: input.command,
					cwd: input.cwd,
					env,
					timeoutMs: input.timeoutMs,
				}),
			);
		},
	},
});
