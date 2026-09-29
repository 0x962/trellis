import { randomUUID } from "node:crypto";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { attemptStopped } from "../agentRuns/attemptCapture.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { columns, getRun, type LaunchRun } from "../agentRuns/queries.ts";
import { recoverPreviousAttempt } from "../agentRuns/recoverPreviousAttempt";
import { reserveAttempt } from "../assignments/attempts.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { assertProjectActive } from "../refs.ts";
import { failOutstandingSessionUpdateRequestForRun } from "../sessionUpdates";
import type { IoCtx } from "../support.ts";
import { archivedSessionRefusal } from "./archived.ts";
import { prepareSessionRepository } from "./directory.ts";
import { launchSession } from "./launchSession";
import { holdSession } from "./operation.ts";
import { sessionProcess } from "./process.ts";
import { getSession, resolveSession } from "./queries.ts";

// The session lock covers recovery and the background launch. Concurrent Resume
// calls cannot reserve two attempts for the same conversation.
export const prepareStart = async (
	ctx: IoCtx,
	input: { id: string },
	deps: {
		process: typeof sessionProcess;
		start: typeof startNative;
		preset: typeof nativePreset;
		recover?: typeof recoverPreviousAttempt;
	} = { process: sessionProcess, start: startNative, preset: nativePreset },
) => {
	const session = await ctx.newTx((tx) => resolveSession(tx, input.id));
	const release = holdSession(ctx.home, session.runId);
	let launching = false;
	try {
		const stored = await ctx.newTx((tx) => getSession(tx, session.id));
		if (stored.archivedAt !== null) throw archivedSessionRefusal();
		const run = await ctx.newTx((tx) => getRun(tx, session.runId));
		if (run.projectId) assertProjectActive(ctx.core, run.projectId);
		let previous = await deps.process(ctx, run.terminalId);
		if (
			run.terminalId !== null &&
			((previous === null && !(await attemptStopped(ctx.home, run.id, run.terminalId))) ||
				(previous !== null && previous.status !== "exited" && !previous.controllable))
		)
			previous = await (deps.recover ?? recoverPreviousAttempt)(ctx, run.terminalId);
		if (previous?.status === "running" && previous.controllable) return { id: session.id };
		if (previous !== null && previous.status !== "exited")
			throw invalidInput("id", "Trellis could not recover this agent. Try Resume again.");
		const fresh = run.projectId === null && run.terminalId === null;
		// The run keeps the provider conversation after terminal logs expire.
		// The saved launch descriptor identifies the harness for that conversation.
		const stopped = previous === null ? run.terminalId !== null : previous.status === "exited";
		const resume =
			stopped &&
			(previous?.agent?.sessionId ?? run.sessionId) != null &&
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
			WHERE id = ${run.id} RETURNING ${columns}`,
			);
			if (run.terminalId !== null)
				await failOutstandingSessionUpdateRequestForRun(ctx.core, tx, {
					runId: run.id,
					error: "The agent restarted before it saved the status update.",
				});
			return { run: updated!, config: selected.config, attempt };
		});
		launchSession(
			ctx,
			session.id,
			{
				run: reservation.run,
				config: reservation.config,
				resume,
				previousAttemptId: resume ? run.terminalId : null,
				previousAccountId: run.accountId ?? null,
				attempt: reservation.attempt,
				resumePrompt: resume ? "Continue this session in the same conversation and workspace." : undefined,
			},
			release,
			deps.start,
			fresh ? () => prepareSessionRepository(session.directory) : undefined,
		);
		launching = true;
		ctx.emit({ type: "sessions.changed", id: session.id });
		ctx.emit({ type: "agent-runs.changed", id: run.id });
		return { id: session.id };
	} finally {
		if (!launching) release();
	}
};
