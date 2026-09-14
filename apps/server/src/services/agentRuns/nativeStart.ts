import type { AgentRun, ProjectManagerConfig } from "@trellis/api";
import { sql } from "drizzle-orm";
import { launchCommand } from "../../agents/launchCommand/launchCommand.ts";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { startClaude } from "../../agents/native/startClaude.ts";
import { nativeWorkspace } from "../../agents/native/workspace.ts";
import { rows } from "../../db/queries/support.ts";
import type { ExecutionAttempt } from "../assignments/attempts.ts";
import type { ServiceCtx } from "../support.ts";
import { assertNativeWorkEnabled } from "./nativeControl.ts";
import { waitForNativeHarness } from "./waitForNativeHarness.ts";

export const startNative = async (
	ctx: ServiceCtx & { localUrl: string },
	input: {
		run: AgentRun;
		config: ProjectManagerConfig;
		resume: boolean;
		context: string;
		attempt: ExecutionAttempt;
		deadlineAt?: number;
	},
	deps = { workspace: nativeWorkspace },
) => {
	const { run, config, resume, context } = input;
	const terminalId = input.attempt.id;
	if (config.harness.preset === "claude" && !config.trustedDirectory) {
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET state = 'failed', error = 'Trust this repository in project settings before a structured agent starts.', updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND state='starting'`,
			),
		);
		return { id: run.id };
	}

	try {
		if (input.deadlineAt !== undefined && input.deadlineAt <= Date.now())
			throw new Error("The flow group deadline elapsed before launch");
		const workspaceId = await deps.workspace(ctx.home, run, config.directory);
		const owned = await ctx.newTx((tx) =>
			rows<{ id: string }>(
				tx,
				sql`UPDATE agent_runs SET workspace_id=${workspaceId} WHERE id=${run.id} AND terminal_id=${terminalId} AND state='starting' RETURNING id`,
			),
		);
		if (owned.length === 0) return { id: run.id };
		const launch = launchCommand({
			run,
			url: ctx.localUrl,
			context,
			directory: workspaceId,
			resume,
			template: resume ? config.harness.resumeCommand : config.harness.startCommand,
		});
		if (input.deadlineAt !== undefined && input.deadlineAt <= Date.now())
			throw new Error("The flow group deadline elapsed before launch");
		await ctx.newTx(assertNativeWorkEnabled);
		const client = await ensureNativeRuntime(ctx.home);
		const env = {
			TRELLIS_URL: ctx.localUrl,
			TRELLIS_ACTOR: `agent:${run.id}`,
			TRELLIS_RUN_ID: run.id,
			TRELLIS_ATTEMPT_TOKEN: input.attempt.token,
			...(process.env.TRELLIS_AUTH_TOKEN === undefined ? {} : { TRELLIS_AUTH_TOKEN: process.env.TRELLIS_AUTH_TOKEN }),
		};
		const session =
			config.harness.preset === "claude"
				? await startClaude(client, {
						attemptId: terminalId,
						sessionId: run.sessionId!,
						cwd: workspaceId,
						env,
						resume,
						prompt: launch.prompt,
						deadlineAt: input.deadlineAt,
						wait: (predicate, options) => waitForNativeHarness(ctx, run, predicate, options),
					})
				: await client.start({
						id: terminalId,
						command: "/bin/zsh",
						args: ["-l", "-c", launch.command],
						cwd: workspaceId,
						env,
						mode: "pty",
						cols: 120,
						rows: 32,
					});
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET state = ${session.status === "running" ? "running" : "interrupted"}, error = ${session.error}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND state = 'starting'`,
			),
		);
	} catch (error) {
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET state = 'interrupted', error = ${error instanceof Error ? error.message : String(error)}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND state = 'starting'`,
			),
		);
	}
	return { id: run.id };
};
