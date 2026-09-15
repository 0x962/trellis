import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import type { ProjectManagerConfig } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { launchCommand } from "../../agents/launchCommand/launchCommand.ts";
import { launchPrompt } from "../../agents/launchCommand/launchPrompt.ts";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { customLaunch } from "../../agents/native/customLaunch.ts";
import { nativeHost, nativePreset } from "../../agents/native/harnessHost.ts";
import { nativeWorkspace } from "../../agents/native/workspace.ts";
import { rows } from "../../db/queries/support.ts";
import { executionEnvironment } from "../../executionEnvironment";
import type { ExecutionAttempt } from "../assignments/attempts.ts";
import type { ServiceCtx } from "../support.ts";
import { assertNativeWorkEnabled } from "./nativeControl.ts";
import type { StoredRun } from "./queries.ts";

class MissingNativeSessionIdentity extends Error {}

type Dependencies = {
	workspace: typeof nativeWorkspace;
	runtime: typeof ensureNativeRuntime;
	env: Record<string, string | undefined>;
	environment: () => Promise<NodeJS.ProcessEnv>;
};
export const startNative = async (
	ctx: ServiceCtx & { localUrl: string },
	input: {
		run: StoredRun;
		config: ProjectManagerConfig;
		resume: boolean;
		previousAttemptId?: string | null;
		context: string;
		attempt: ExecutionAttempt;
		deadlineAt?: number;
	},
	deps: Partial<Dependencies> = {},
) => {
	const { run, config, resume, context } = input;
	const terminalId = input.attempt.id;
	if (config.harness.preset === "claude" && !config.trustedDirectory) {
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET closed_at = ${ctx.now()}, error = 'Trust this repository in project settings before an agent starts.', updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND closed_at IS NULL`,
			),
		);
		return { id: run.id };
	}
	let launchSubmitted = false;
	try {
		if (input.deadlineAt !== undefined && input.deadlineAt <= Date.now())
			throw new Error("The flow group deadline elapsed before launch");
		const baseEnv = deps.env ?? (await (deps.environment ?? executionEnvironment)());
		const workspaceId = await (deps.workspace ?? nativeWorkspace)(ctx.home, run, config.directory);
		const owned = await ctx.newTx((tx) =>
			rows<{ id: string }>(
				tx,
				sql`UPDATE agent_runs SET workspace_id=${workspaceId} WHERE id=${run.id} AND terminal_id=${terminalId} AND closed_at IS NULL RETURNING id`,
			),
		);
		if (owned.length === 0) return { id: run.id };
		await ctx.newTx(assertNativeWorkEnabled);
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
		const timeoutMs = input.deadlineAt === undefined ? undefined : input.deadlineAt - Date.now();
		if (timeoutMs !== undefined && timeoutMs <= 0) throw new Error("The flow group deadline elapsed before launch");
		let session: RuntimeProcessStatus;
		if (config.harness.preset === "custom") {
			const launch = launchCommand({
				run,
				url: ctx.localUrl,
				context,
				messageId: terminalId,
				directory: workspaceId,
				resume,
				template: resume ? config.harness.resumeCommand : config.harness.startCommand,
			});
			const spec = await customLaunch(ctx.home, {
				id: terminalId,
				command: launch.command,
				cwd: workspaceId,
				env,
				timeoutMs,
			});
			launchSubmitted = true;
			await client.start(spec);
			session = await client.inspect(terminalId);
		} else {
			const host = nativeHost(ctx.home, env, client);
			const launch = {
				id: terminalId,
				harness: config.harness.preset,
				cwd: workspaceId,
				prompt: launchPrompt({ run, url: ctx.localUrl, context }),
				model: config.harness.model,
				token: input.attempt.token,
				timeoutMs,
			};
			let sessionId: string | undefined;
			if (resume) {
				if (!input.previousAttemptId)
					throw new Error("This assignment has no prior native attempt. Start a new session.");
				const previous = await host.status(input.previousAttemptId);
				if (previous.status !== "exited")
					throw new Error("Confirm the prior process stopped before you resume its session.");
				if (
					previous.agent?.sessionId == null ||
					(await nativePreset(ctx.home, input.previousAttemptId)) !== config.harness.preset
				)
					throw new MissingNativeSessionIdentity(
						"The prior attempt has no confirmed session for this harness. Start a new session.",
					);
				sessionId = previous.agent.sessionId;
			}
			await host.prepare(launch, sessionId);
			launchSubmitted = true;
			({ process: session } =
				sessionId === undefined ? await host.start(launch) : await host.resume({ ...launch, sessionId }));
		}
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET session_id = ${session.agent?.sessionId ?? (config.harness.preset === "custom" ? run.sessionId : null)}, closed_at = ${session.status === "exited" ? ctx.now() : null}, error = ${session.agent?.error ?? session.error}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND closed_at IS NULL`,
			),
		);
	} catch (error) {
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET session_lost = session_lost OR ${error instanceof MissingNativeSessionIdentity}, closed_at = ${launchSubmitted ? null : ctx.now()}, error = ${error instanceof Error ? error.message : String(error)}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND closed_at IS NULL`,
			),
		);
		if (launchSubmitted)
			throw new ORPCError("RUNNER_UNAVAILABLE", {
				defined: true,
				status: 503,
				message: error instanceof Error ? error.message : String(error),
				data: { reason: "error" },
			});
	}
	return { id: run.id };
};
