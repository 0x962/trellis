import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { RuntimeLaunchCaptureIdentity } from "@trellis/runtime-protocol";
import { type RuntimeMutationScope, withRuntimeMutationExclusion } from "@trellis/runtime-protocol/mutation-exclusion";
import type { HarnessDescriptor } from "../../../agents/harnessHost/types";
import { gitCommonDirectory } from "../../../agents/native/gitCommonDirectory";
import { nativeWorkspaceUnderExclusion } from "../../../agents/native/nativeWorkspaceUnderExclusion";
import type { nativeWorkspace } from "../../../agents/native/workspace";
import { agentWorkspace } from "../../../agents/native/workspaceLayout";
import { executionEnvironment } from "../../../executionEnvironment";
import { readHostDefault } from "../../harnessAccounts/hostDefault";
import { profileDefault, profileEnvironment } from "../../harnessAccounts/profiles";
import { getAccount } from "../../harnessAccounts/queries";
import type { ProjectLaunchConfig } from "../../projectLaunchConfig/projectLaunchConfig";
import type { ServiceCtx } from "../../support";
import type { LaunchRun } from "../queries";
import { readPrivateRecord } from "./privateRecord";
import { canonicalMutationPath, providerRoots } from "./providerRoots";
import { retainLaunchCapture } from "./retainLaunchCapture";

type Input = {
	run: LaunchRun;
	config: ProjectLaunchConfig;
	attempt: { id: string };
	resume: boolean;
	previousAttemptId?: string | null;
	signal?: AbortSignal;
};
type Dependencies = {
	workspace: typeof nativeWorkspace;
	commonDirectory: typeof gitCommonDirectory;
	env: NodeJS.ProcessEnv;
	environment: typeof executionEnvironment;
};
type Selection = { baseEnv: NodeJS.ProcessEnv; workspaceId: string; capture: RuntimeLaunchCaptureIdentity | undefined };

async function selectedEnvironment(ctx: ServiceCtx, input: Input, deps: Partial<Dependencies>) {
	const ambient = deps.env ?? (await (deps.environment ?? executionEnvironment)());
	const account = input.run.accountId ? await ctx.newTx((tx) => getAccount(tx, { id: input.run.accountId! })) : null;
	const harness = input.config.harness.preset;
	if (account && account.harness !== harness) throw new Error("The selected account belongs to another harness.");
	if (account) return profileEnvironment(account, ambient);
	if (harness !== "claude" && harness !== "codex") return ambient;
	const variable = harness === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
	if (ambient[variable]) return ambient;
	const pointer = await readHostDefault(harness, ambient);
	return pointer.profilePath ? profileEnvironment({ harness, profilePath: pointer.profilePath }, ambient) : ambient;
}

export async function withNativeLaunchScope<T>(
	ctx: ServiceCtx,
	input: Input,
	deps: Partial<Dependencies>,
	action: (selection: Selection) => Promise<T>,
): Promise<T> {
	const baseEnv = await selectedEnvironment(ctx, input, deps);
	const harness = input.config.harness.preset;
	const profilePath = harness === "custom" ? null : profileDefault(harness, baseEnv);
	const provider = profilePath === null ? null : await providerRoots(harness as Exclude<typeof harness, "custom">, profilePath);
	const previousPath = input.resume && input.previousAttemptId
		? join(ctx.home, "harness-attempts", input.previousAttemptId, "launch.json") : null;
	const previous = previousPath ? await readPrivateRecord<HarnessDescriptor>(previousPath) : undefined;
	const currentPath = join(ctx.home, "harness-attempts", input.attempt.id, "launch.json");
	const current = await readPrivateRecord<HarnessDescriptor>(currentPath);
	const priorProvider = previous && harness !== "custom"
		? await providerRoots(harness, profileDefault(harness, previous.spec.env ?? {})) : null;
	const priorScopePaths = [...new Set([
		...(previous?.spec.capture?.providerScopePaths ?? []),
		...(current?.spec.capture?.providerScopePaths ?? []),
		...(priorProvider?.paths ?? []),
	])].sort();
	const workspaceSources = [
		input.run.workspaceId ?? agentWorkspace(ctx.home, input.run.id),
		agentWorkspace(ctx.home, input.run.id),
		input.config.directory,
	];
	const workspacePaths = await Promise.all(workspaceSources.map(canonicalMutationPath));
	const commonDirectory = await (deps.commonDirectory ?? gitCommonDirectory)(input.config.directory, baseEnv);
	const scopes: RuntimeMutationScope[] = [
		...workspacePaths.map((directory) => ({ kind: "workspace" as const, directory })),
		...[...(provider?.paths ?? []), ...priorScopePaths].map((directory) => ({ kind: "provider" as const, directory })),
		{ kind: "attempt-retention", directory: join(ctx.home, "harness-attempts") },
		{ kind: "attempt", directory: join(ctx.home, "harness-attempts", input.attempt.id) },
		...(input.resume && input.previousAttemptId
			? [{ kind: "attempt" as const, directory: join(ctx.home, "harness-attempts", input.previousAttemptId) }] : []),
		{ kind: "repository", directory: commonDirectory },
	];
	return withRuntimeMutationExclusion(ctx.home, scopes, async () => {
		if (!isDeepStrictEqual(current, await readPrivateRecord<HarnessDescriptor>(currentPath)) ||
			(previousPath && !isDeepStrictEqual(previous, await readPrivateRecord<HarnessDescriptor>(previousPath))))
			throw new Error("native_capture_launch_changed");
		if (profilePath !== null && !isDeepStrictEqual(provider, await providerRoots(harness as Exclude<typeof harness, "custom">, profilePath)))
			throw new Error("native_capture_provider_changed");
		if (previous && harness !== "custom" && !isDeepStrictEqual(priorProvider,
			await providerRoots(harness, profileDefault(harness, previous.spec.env ?? {}))))
			throw new Error("native_capture_provider_changed");
		if (!isDeepStrictEqual(workspacePaths, await Promise.all(workspaceSources.map(canonicalMutationPath))) ||
			commonDirectory !== await (deps.commonDirectory ?? gitCommonDirectory)(input.config.directory, baseEnv))
			throw new Error("native_capture_workspace_changed");
		const workspaceId = await (deps.workspace ?? nativeWorkspaceUnderExclusion)(ctx.home, input.run, input.config.directory);
		if (!workspacePaths.includes(await canonicalMutationPath(workspaceId))) throw new Error("native_capture_workspace_changed");
		const capture = harness === "custom" ? undefined : await retainLaunchCapture({
			home: ctx.home, harness, accountId: input.run.accountId, agentRunId: input.run.id,
			attemptId: input.attempt.id, provider: provider!, priorScopePaths,
		});
		return action({ baseEnv, workspaceId, capture });
	}, input.signal);
}
