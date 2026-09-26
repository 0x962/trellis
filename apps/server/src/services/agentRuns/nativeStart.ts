import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import type { HarnessDescriptor, HarnessStartInput } from "../../agents/harnessHost/types.ts";
import { launchCommand } from "../../agents/launchCommand/launchCommand.ts";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { customLaunch } from "../../agents/native/customLaunch.ts";
import { nativeHost, nativePreset } from "../../agents/native/harnessHost.ts";
import { agentWorkspace, nativeWorkspace } from "../../agents/native/workspace.ts";
import { workspaceOperation } from "../../agents/native/workspaceOperation.ts";
import { rows } from "../../db/queries/support.ts";
import { executionEnvironment } from "../../executionEnvironment";
import { launchGuide } from "../agentPrompt/launchGuide.ts";
import type { ExecutionAttempt } from "../assignments/attempts.ts";
import { readHostDefault } from "../harnessAccounts/hostDefault.ts";
import { profileDefault, profileEnvironment } from "../harnessAccounts/profiles.ts";
import { getAccount } from "../harnessAccounts/queries.ts";
import { transferSession } from "../harnessAccounts/transferSession.ts";
import type { ProjectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import type { IoCtx, ServiceCtx } from "../support.ts";
import { attemptStopped } from "./attemptCapture.ts";
import { hostIsShuttingDown } from "./hostShutdown.ts";
import { launchAllowed } from "./launchAllowed.ts";
import { launchedHarness } from "./launchedHarness";
import type { LaunchRun } from "./queries.ts";

class MissingNativeSessionIdentity extends Error {}

type Dependencies = {
	workspace: typeof nativeWorkspace;
	runtime: typeof ensureNativeRuntime;
	guide: typeof launchGuide;
	env: Record<string, string | undefined>;
	environment: () => Promise<NodeJS.ProcessEnv>;
};
const exportedProfile: Partial<Record<string, string>> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME" };

export const promptForLaunch = (resume: boolean, resumePrompt: string | undefined, guide: () => Promise<string>) =>
	resume ? Promise.resolve(resumePrompt!) : guide();

async function hostDefaultProfile(
	preset: string,
	env: NodeJS.ProcessEnv,
): Promise<{ harness: "claude" | "codex"; profilePath: string } | null> {
	if (preset !== "claude" && preset !== "codex") return null;
	if (env[exportedProfile[preset]!]) return null;
	const pointer = await readHostDefault(preset, env);
	return pointer.profilePath ? { harness: preset, profilePath: pointer.profilePath } : null;
}

const start = async (
	ctx: ServiceCtx & Pick<IoCtx, "core" | "localUrl">,
	input: {
		run: LaunchRun;
		config: ProjectLaunchConfig;
		resume: boolean;
		previousAttemptId?: string | null;
		previousAccountId?: string | null;
		attempt: ExecutionAttempt;
		deadlineAt?: number;
		// The time limit of a flow box whose clock starts with this process.
		budgetMs?: number;
		prompt?: string;
		resumePrompt?: string;
		preserveAssignmentOnFailure?: boolean;
	},
	deps: Partial<Dependencies> = {},
) => {
	const { run, config, resume } = input;
	const terminalId = input.attempt.id;
	const previousTerminalId = resume ? (input.previousAttemptId ?? null) : null;
	let launchSubmitted = false;
	let launchedAt: string | undefined;
	let retireIdleAttempt = false;
	try {
		if (input.deadlineAt !== undefined && input.deadlineAt <= Date.now())
			throw new Error("The flow group deadline elapsed before launch");
		const ambientEnv = deps.env ?? (await (deps.environment ?? executionEnvironment)());
		const account = run.accountId ? await ctx.newTx((tx) => getAccount(tx, { id: run.accountId! })) : null;
		if (account && account.harness !== config.harness.preset)
			throw new Error("The selected account belongs to another harness.");
		// A run with no account reads the SuperSet pointer at every launch, so
		// a switch made in SuperSet reaches the next Trellis launch. A profile
		// the person exported in the login shell wins over the pointer.
		const profile = account ?? (await hostDefaultProfile(config.harness.preset, ambientEnv));
		const baseEnv = profile ? await profileEnvironment(profile, ambientEnv) : ambientEnv;
		const workspaceId = await (deps.workspace ?? nativeWorkspace)(ctx.home, run, config.directory);
		const owned = await ctx.newTx(async (tx) => {
			if (run.ticketId !== null) {
				const [ticket] = await rows<{ id: string }>(tx, sql`SELECT id FROM tickets WHERE id=${run.ticketId}`);
				if (!ticket) {
					await tx.execute(
						sql`UPDATE agent_runs SET closed_at=${ctx.now()},error='The ticket no longer exists.' WHERE id=${run.id} AND terminal_id=${terminalId} AND closed_at IS NULL`,
					);
					return [];
				}
			}
			return rows<{ id: string }>(
				tx,
				sql`UPDATE agent_runs SET workspace_id=${workspaceId} WHERE id=${run.id} AND terminal_id=${terminalId} AND closed_at IS NULL RETURNING id`,
			);
		});
		if (owned.length === 0 || hostIsShuttingDown(ctx.home)) return { id: run.id };
		const prompt = await promptForLaunch(resume, input.resumePrompt, () =>
			(deps.guide ?? launchGuide)(ctx, {
				run,
				workspace: workspaceId,
				attemptId: terminalId,
				message: input.prompt,
				env: baseEnv,
			}),
		);
		if (prompt.length > 200_000)
			throw new Error(
				`The launch prompt contains ${prompt.length} characters; the runtime limit is 200000. Reduce the ticket or project context.`,
			);
		const env = {
			...baseEnv,
			TRELLIS_URL: ctx.localUrl,
			TRELLIS_ACTOR: `agent:${run.id}`,
			TRELLIS_RUN_ID: run.id,
			TRELLIS_ATTEMPT_ID: terminalId,
			TRELLIS_RUNTIME_HOME: join(ctx.home, "runtime"),
			TRELLIS_ATTEMPT_TOKEN: input.attempt.token,
		};
		const client = await (deps.runtime ?? ensureNativeRuntime)(ctx.home);
		// A box clock that already runs gives its time left. A box clock that
		// starts with this process gives its whole budget.
		const remainingMs = input.deadlineAt === undefined ? Infinity : input.deadlineAt - Date.now();
		if (remainingMs <= 0) throw new Error("The flow group deadline elapsed before launch");
		const limitMs = Math.min(remainingMs, input.budgetMs ?? Infinity);
		const timeoutMs = Number.isFinite(limitMs) ? limitMs : undefined;
		let session: RuntimeProcessStatus;
		if (config.harness.preset === "custom") {
			const launch = launchCommand({
				run,
				url: ctx.localUrl,
				messageId: terminalId,
				directory: workspaceId,
				template: resume ? config.harness.resumeCommand : config.harness.startCommand,
				prompt,
			});
			const spec = await customLaunch(ctx.home, {
				id: terminalId,
				command: launch.command,
				cwd: workspaceId,
				env,
				timeoutMs,
			});
			if (
				!(await ctx.newTx((tx) =>
					launchAllowed(tx, {
						runId: run.id,
						terminalId,
					}),
				))
			)
				return { id: run.id };
			if (hostIsShuttingDown(ctx.home)) return { id: run.id };
			launchSubmitted = true;
			await client.start(spec);
			session = await client.inspect(terminalId);
		} else {
			const host = nativeHost(ctx.home, env, client, ctx.log);
			const launch: HarnessStartInput = {
				id: terminalId,
				...(run.kind === "session" ? {} : { kind: "builder" }),
				harness: config.harness.preset,
				cwd: workspaceId,
				prompt,
				model: config.harness.model,
				effort: config.harness.effort,
				token: input.attempt.token,
				timeoutMs,
			};
			let sessionId: string | undefined;
			if (resume) {
				if (!input.previousAttemptId)
					throw new Error("This assignment has no prior native attempt. Start a new session.");
				// The runtime keeps the record of an exited attempt in memory and
				// forgets it when it starts again. Three facts outlive it: the
				// output file that `stopNative` wrote after the runtime confirmed
				// the exit, `agent_runs.session_id`, which holds the provider
				// conversation of the last confirmed launch, and `launch.json`,
				// which holds the harness, the directory and the environment. So
				// a resume after a restart of the runtime keeps the conversation.
				const previous = await host.status(input.previousAttemptId).catch((error: NodeJS.ErrnoException) => {
					if (error.code !== "SESSION_NOT_FOUND") throw error;
					return null;
				});
				retireIdleAttempt = previous?.stopReason === "idle";
				if (previous === null) {
					if (!(await attemptStopped(ctx.home, run.id, input.previousAttemptId)))
						throw new Error("The prior process is not confirmed stopped. Inspect the agent before you resume it.");
				} else if (previous.status !== "exited")
					throw new Error("Confirm the prior process stopped before you resume its session.");
				const identity = previous?.agent?.sessionId ?? run.sessionId;
				if (identity == null || (await nativePreset(ctx.home, input.previousAttemptId)) !== config.harness.preset)
					throw new MissingNativeSessionIdentity(
						"The prior attempt has no confirmed session for this harness. Start a new session.",
					);
				sessionId = identity;
				const old: HarnessDescriptor = JSON.parse(
					await readFile(join(ctx.home, "harness-attempts", input.previousAttemptId, "launch.json"), "utf8"),
				);
				const from = profileDefault(config.harness.preset, old.spec.env!);
				const to = profileDefault(config.harness.preset, env);
				if (from !== to)
					await transferSession({
						harness: config.harness.preset,
						from,
						to,
						sessionId,
						cwd: previous?.launch?.cwd ?? old.spec.cwd,
						env,
						directory: join(ctx.home, "harness-attempts", terminalId, "transfer"),
					});
			}
			await host.prepare(launch, sessionId);
			if (
				!(await ctx.newTx((tx) =>
					launchAllowed(tx, {
						runId: run.id,
						terminalId,
					}),
				))
			)
				return { id: run.id };
			if (hostIsShuttingDown(ctx.home)) return { id: run.id };
			launchSubmitted = true;
			({ process: session } =
				sessionId === undefined ? await host.start(launch) : await host.resume({ ...launch, sessionId }));
		}
		launchedAt = session.startedAt;
		const harness = launchedHarness(config.harness, session.agent?.model);
		ctx.log("agent run launched", {
			run: run.id,
			ticket: run.ticketIdentifier,
			harness: config.harness.preset,
			waitMs: Date.parse(session.startedAt) - Date.parse(run.createdAt),
		});
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET workspace_id = ${workspaceId}, launched_at = COALESCE(launched_at, ${session.startedAt}), harness = ${JSON.stringify(harness)}::jsonb, session_id = ${session.agent?.sessionId ?? (config.harness.preset === "custom" ? run.sessionId : null)}, closed_at = CASE WHEN ${session.status === "exited"} AND kind NOT IN ('agent', 'session') THEN ${ctx.now()}::timestamptz ELSE NULL END, error = ${session.agent?.error ?? session.error}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND closed_at IS NULL`,
			),
		);
		if (retireIdleAttempt) await client.stop(previousTerminalId!);
	} catch (error) {
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET account_id = ${!launchSubmitted && resume && input.previousAccountId !== undefined ? input.previousAccountId : (run.accountId ?? null)}, terminal_id = ${launchSubmitted || input.preserveAssignmentOnFailure || run.kind === "flow" ? terminalId : previousTerminalId}, session_lost = session_lost OR ${error instanceof MissingNativeSessionIdentity}, closed_at = ${launchSubmitted || input.preserveAssignmentOnFailure ? null : ctx.now()}, error = ${error instanceof Error ? error.message : String(error)}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND closed_at IS NULL`,
			),
		);
		if (launchSubmitted || run.kind === "flow")
			throw new ORPCError("RUNNER_UNAVAILABLE", {
				defined: true,
				status: 503,
				message: error instanceof Error ? error.message : String(error),
				data: { reason: "error" },
			});
	}
	return { id: run.id, launchedAt };
};

export const startNative = (...args: Parameters<typeof start>) =>
	workspaceOperation(args[1].run.workspaceId ?? agentWorkspace(args[0].home, args[1].run.id), () => start(...args));
