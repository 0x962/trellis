import type { AccountHarness } from "@trellis/api";
import { assertTarget } from "@trellis/runtime-protocol/execution";
import { customLaunch } from "../../../../agents/native/customLaunch.ts";
import { nativeHost } from "../../../../agents/native/harnessHost.ts";
import { nativeWorkspace } from "../../../../agents/native/workspace.ts";
import { readHostDefault } from "../../../../services/harnessAccounts/hostDefault.ts";
import { profileEnvironment } from "../../../../services/harnessAccounts/profiles.ts";
import { localAttemptEnvironment } from "../../LocalAttemptEnvironment";
import type { LocalExecutionHost, LocalHostDeps } from "../LocalExecutionHost.ts";

const exportedProfile: Partial<Record<string, string>> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME" };

// The machine-wide default login of a harness, the way SuperSet publishes
// it. A profile the person exported in the login shell wins over the
// pointer, and a harness without a pointer file has no default profile.
async function hostDefaultProfile(
	harness: string,
	env: NodeJS.ProcessEnv,
): Promise<{ harness: AccountHarness; profilePath: string } | null> {
	if (harness !== "claude" && harness !== "codex") return null;
	if (env[exportedProfile[harness]!]) return null;
	const pointer = await readHostDefault(harness, env);
	return pointer.profilePath ? { harness, profilePath: pointer.profilePath } : null;
}

export const localPrepare = (deps: LocalHostDeps): Pick<LocalExecutionHost, "prepare"> => ({
	prepare: {
		async workspace(target, { run, directory }) {
			assertTarget(deps.binding, target);
			return { workspaceId: await nativeWorkspace(deps.home, run, directory, { environment: deps.env }) };
		},
		async descriptor(target, input) {
			assertTarget(deps.binding, target);
			const ambient = await deps.env();
			const profile = input.account ?? (await hostDefaultProfile(input.harness, ambient));
			const base = profile ? await profileEnvironment(profile, ambient) : ambient;
			const env = { ...base, ...localAttemptEnvironment(deps, target, input.token) };
			const { account: _account, sessionId, ...launch } = input;
			return nativeHost(deps.home, env, deps.connection.client(), deps.log).prepare(launch, sessionId);
		},
		async custom(target, input) {
			assertTarget(deps.binding, target);
			const env = { ...(await deps.env()), ...localAttemptEnvironment(deps, target, input.token) };
			return customLaunch(deps.home, {
				id: target.attemptId,
				command: input.command,
				cwd: input.cwd,
				env,
				timeoutMs: input.timeoutMs,
			});
		},
	},
});
