import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { invalidInput } from "../../errors.ts";
import { executionEnvironment } from "../../executionEnvironment";
import { upsert } from "../actors.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { getRun } from "../agentRuns/queries.ts";
import type { IoCtx } from "../support.ts";
import { removeSessionDirectory } from "./directory.ts";
import { sessionOperation } from "./operation.ts";
import { sessionProcess } from "./process.ts";
import { getSession } from "./queries.ts";

// The run retains its output after the session and its worktree are deleted.
export const prepareDelete = async (
	ctx: IoCtx,
	input: { id: string },
	deps = { process: sessionProcess, stop: stopNative },
) => {
	const session = await ctx.newTx((tx) => getSession(tx, input.id));
	return sessionOperation(ctx.home, session.runId, async () => {
		await ctx.newTx((tx) => getSession(tx, input.id));
		const run = await ctx.newTx((tx) => getRun(tx, session.runId));
		const previous = await deps.process(ctx, run.terminalId);
		if (previous === null && run.terminalId !== null && run.closedAt === null)
			throw invalidInput("id", "The prior launch is not confirmed. Inspect the agent before deletion.");
		if (previous !== null && previous.status !== "exited") await deps.stop(ctx, run);
		else if (run.closedAt === null)
			await ctx.newTx((tx) =>
				tx.execute(sql`UPDATE agent_runs SET closed_at = ${ctx.now()}, updated_at = ${ctx.now()} WHERE id = ${run.id}`),
			);
		if (session.directory === join(ctx.home, "agents", run.id, "work")) {
			const exists = await stat(session.directory).catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return null;
				throw error;
			});
			if (exists)
				await promisify(execFile)(
					"git",
					["-C", session.directory, "worktree", "remove", "--force", session.directory],
					{
						env: await executionEnvironment(),
					},
				);
		} else await removeSessionDirectory(ctx.home, session.directory);
		await ctx.newTx(async (tx) => {
			await upsert(ctx.core, tx, ctx.actor);
			await tx.execute(sql`DELETE FROM sessions WHERE id = ${session.id}`);
		});
		ctx.emit({ type: "sessions.changed", id: session.id });
		ctx.emit({ type: "agent-runs.changed", id: run.id });
		return { id: session.id };
	});
};
