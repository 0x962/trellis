import { randomUUID } from "node:crypto";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { getRun, launchColumns } from "../agentRuns/queries.ts";
import type { LaunchRun } from "../agentRuns/types.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { assertProjectActive } from "../refs.ts";
import type { IoCtx } from "../support.ts";
import { prepareSessionRepository } from "./directory.ts";
import { sessionOperation } from "./operation.ts";
import { sessionProcess } from "./process.ts";
import { getSession, resolveSession } from "./queries.ts";

// Starts the agent of an idle session again. The harness resumes its saved
// conversation when the previous process confirmed one for the same harness.
// Otherwise the agent starts fresh in the same directory, with the original
// prompt as its first message. A session whose agent runs stays as it is. A
// process the runtime cannot vouch for blocks the start, so two processes
// never share one session directory.
export const prepareStart = async (
	ctx: IoCtx,
	input: { id: string },
	deps = { process: sessionProcess, start: startNative, preset: nativePreset },
) => {
	const session = await ctx.newTx((tx) => resolveSession(tx, input.id));
	return sessionOperation(ctx.home, session.runId, async () => {
		await ctx.newTx((tx) => getSession(tx, session.id));
		const run = await ctx.newTx((tx) => getRun(tx, session.runId));
		if (run.projectId) assertProjectActive(ctx.core, run.projectId);
		const previous = await deps.process(ctx, run.terminalId);
		if (previous === null && run.terminalId !== null && run.closedAt === null)
			throw invalidInput("id", "The prior launch is not confirmed. Inspect the agent before another start.");
		if (previous?.status === "running") return { id: session.id };
		if (previous !== null && previous.status !== "exited")
			throw invalidInput("id", "Stop the prior process and confirm it exited before you start the session again.");
		if (run.projectId === null && run.terminalId === null) await prepareSessionRepository(session.directory);
		const resume =
			previous?.status === "exited" &&
			previous.agent?.sessionId != null &&
			previous.launch !== null &&
			session.harness.preset !== "custom" &&
			(await deps.preset(ctx.home, run.terminalId!)) === session.harness.preset;
		const reservation = await ctx.newTx(async (tx) => {
			if (run.projectId) assertProjectActive(ctx.core, run.projectId);
			const current = await getRun(tx, run.id);
			if (current.terminalId !== run.terminalId || current.closedAt !== run.closedAt)
				throw invalidInput("id", "Another call already changed this session. Read its current state.");
			await upsert(ctx.core, tx, ctx.actor);
			const config = run.projectId
				? await projectLaunchConfig(tx, { projectId: run.projectId, harness: session.harness })
				: { directory: session.directory, harness: HarnessSchema.parse(session.harness), accountId: null };
			const selected = await selectAccount(tx, {
				accountId: run.accountId,
				config: { ...config, harness: session.harness },
				useDefault: !resume,
			});
			const attempt = await reserveAttempt(ctx.core, tx, { runId: run.id });
			const [updated] = await rows<LaunchRun>(
				tx,
				sql`UPDATE agent_runs SET closed_at = NULL, error = NULL, session_lost = false, terminal_id = ${attempt.id}, account_id = ${selected.accountId}, harness = ${JSON.stringify(selected.config.harness)}::jsonb,
			session_id = ${resume ? run.sessionId : session.harness.preset === "custom" ? randomUUID() : null}, updated_at = ${ctx.now()}
			WHERE id = ${run.id} RETURNING ${launchColumns}`,
			);
			return { run: updated!, config: selected.config, attempt };
		});
		ctx.emit({ type: "sessions.changed", id: session.id });
		ctx.emit({ type: "agent-runs.changed", id: run.id });
		await deps.start(ctx, {
			run: reservation.run,
			config: reservation.config,
			resume,
			previousAttemptId: resume ? run.terminalId : null,
			previousAccountId: run.accountId ?? null,
			attempt: reservation.attempt,
			resumePrompt: resume ? "Continue this session in the same conversation and workspace." : undefined,
		});
		return { id: session.id };
	});
};
