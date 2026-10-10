import type { AccountHarness } from "@trellis/api";
import { type ExecutionTarget, LaunchSpecMismatch } from "@trellis/runtime-protocol/execution";
import type { HarnessStartInput } from "../../../../agents/harnessHost/types.ts";
import { nativeHost } from "../../../../agents/native/harnessHost.ts";
import { readHostDefault } from "../../../../services/harnessAccounts/hostDefault.ts";
import { profileEnvironment } from "../../../../services/harnessAccounts/profiles.ts";
import { localAttemptEnvironment } from "../../LocalAttemptEnvironment";
import type { LocalHostDeps, LocalPrepareInput } from "../LocalExecutionHost.ts";

const exportedProfile: Partial<Record<string, string>> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME" };

// The machine-wide default login of a harness, the way SuperSet publishes
// it. A profile the person exported in the login shell wins over the
// pointer, and a harness without a pointer file has no default profile.
// `nativeStart.ts` holds the same function for the launch path it owns.
async function hostDefaultProfile(
	harness: string,
	env: NodeJS.ProcessEnv,
): Promise<{ harness: AccountHarness; profilePath: string } | null> {
	if (harness !== "claude" && harness !== "codex") return null;
	if (env[exportedProfile[harness]!]) return null;
	const pointer = await readHostDefault(harness, env);
	return pointer.profilePath ? { harness, profilePath: pointer.profilePath } : null;
}

// The HarnessHost that prepares and launches `input` for `target`, with the
// environment the process receives: the login environment of the host, the
// account profile of the run and the six attempt values, in that order of
// precedence from low to high. The fingerprint of the launch record derives
// from that environment, so every call for one attempt builds it the same
// way.
export async function prepareHost(deps: LocalHostDeps, target: ExecutionTarget, input: LocalPrepareInput) {
	if (input.id !== target.attemptId) throw new LaunchSpecMismatch(target.attemptId, input.id);
	const ambient = await deps.env();
	const profile = input.account ?? (await hostDefaultProfile(input.harness, ambient));
	const base = profile ? await profileEnvironment(profile, ambient) : ambient;
	const env = { ...base, ...localAttemptEnvironment(deps, target, input.token) };
	const { account: _account, sessionId, ...launch } = input;
	return {
		host: nativeHost(deps.home, env, deps.connection.client(), deps.log),
		launch: launch satisfies HarnessStartInput,
		sessionId,
	};
}
