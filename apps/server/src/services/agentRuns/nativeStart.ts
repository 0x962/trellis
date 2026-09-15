import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ORPCError } from "@orpc/server";
import type { ProjectManagerConfig } from "@trellis/api";
import { sql } from "drizzle-orm";
import { launchCommand } from "../../agents/launchCommand/launchCommand.ts";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { interactiveLaunchSpec } from "../../agents/native/interactiveLaunchSpec.ts";
import { nativeWorkspace } from "../../agents/native/workspace.ts";
import { rows } from "../../db/queries/support.ts";
import type { ExecutionAttempt } from "../assignments/attempts.ts";
import type { ServiceCtx } from "../support.ts";
import { assertNativeWorkEnabled } from "./nativeControl.ts";
import type { StoredRun } from "./queries.ts";
import { waitForReceipt } from "./waitForReceipt.ts";

export const startNative = async (
	ctx: ServiceCtx & { localUrl: string },
	input: {
		run: StoredRun;
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
				sql`UPDATE agent_runs SET closed_at = ${ctx.now()}, error = 'Trust this repository in project settings before an agent starts.', updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND closed_at IS NULL`,
			),
		);
		return { id: run.id };
	}

	let launchSubmitted = false;
	let awaitingReceipt = false;
	try {
		if (input.deadlineAt !== undefined && input.deadlineAt <= Date.now())
			throw new Error("The flow group deadline elapsed before launch");
		const workspaceId = await deps.workspace(ctx.home, run, config.directory);
		const owned = await ctx.newTx((tx) =>
			rows<{ id: string }>(
				tx,
				sql`UPDATE agent_runs SET workspace_id=${workspaceId} WHERE id=${run.id} AND terminal_id=${terminalId} AND closed_at IS NULL RETURNING id`,
			),
		);
		if (owned.length === 0) return { id: run.id };
		const launch = launchCommand({
			run,
			url: ctx.localUrl,
			context,
			messageId: terminalId,
			directory: workspaceId,
			resume,
			template: resume ? config.harness.resumeCommand : config.harness.startCommand,
		});
		if (input.deadlineAt !== undefined && input.deadlineAt <= Date.now())
			throw new Error("The flow group deadline elapsed before launch");
		await ctx.newTx(assertNativeWorkEnabled);
		const client = await ensureNativeRuntime(ctx.home);
		const env = {
			...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
			TRELLIS_URL: ctx.localUrl,
			TRELLIS_ACTOR: `agent:${run.id}`,
			TRELLIS_RUN_ID: run.id,
			TRELLIS_ATTEMPT_ID: terminalId,
			TRELLIS_RUNTIME_HOME: join(ctx.home, "runtime"),
			TRELLIS_ATTEMPT_TOKEN: input.attempt.token,
			...(process.env.TRELLIS_AUTH_TOKEN === undefined ? {} : { TRELLIS_AUTH_TOKEN: process.env.TRELLIS_AUTH_TOKEN }),
		};
		const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
		const hook = fileURLToPath(new URL("../../agents/native/claudeHook.ts", import.meta.url));
		launchSubmitted = true;
		let session = await client.start(
			interactiveLaunchSpec({
				id: terminalId,
				command: launch.command,
				cwd: workspaceId,
				env,
				preset: config.harness.preset,
				hookCommand: `${quote(process.execPath)} ${quote(hook)}`,
				timeoutMs: input.deadlineAt === undefined ? undefined : input.deadlineAt - Date.now(),
			}),
		);
		if (config.harness.preset === "claude") {
			awaitingReceipt = true;
			session = await waitForReceipt(
				client,
				terminalId,
				terminalId,
				Math.max(1, Math.min(60_000, (input.deadlineAt ?? Infinity) - Date.now())),
			);
			awaitingReceipt = false;
		}
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET closed_at = ${session.status === "exited" ? ctx.now() : null}, error = ${session.error}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND closed_at IS NULL`,
			),
		);
	} catch (error) {
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET closed_at = ${launchSubmitted ? null : ctx.now()}, error = ${error instanceof Error ? error.message : String(error)}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${terminalId} AND closed_at IS NULL`,
			),
		);
		if (awaitingReceipt)
			throw new ORPCError("RUNNER_UNAVAILABLE", {
				defined: true,
				status: 503,
				message: error instanceof Error ? error.message : String(error),
				data: { reason: "error" },
			});
	}
	return { id: run.id };
};
