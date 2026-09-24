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
import { reserveAttempt } from "../assignments/attempts.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { assertProjectActive } from "../refs.ts";
import type { IoCtx } from "../support.ts";
import { archivedSessionRefusal } from "./archived.ts";
import { prepareSessionRepository } from "./directory.ts";
import { launchSession } from "./launchSession";
import { holdSession } from "./operation.ts";
import { sessionProcess } from "./process.ts";
import { getSession, resolveSession } from "./queries.ts";

// Starts the agent of an idle session again. The harness resumes its saved
// conversation when the previous process confirmed one for the same harness.
// Otherwise the agent starts fresh in the same directory, with the original
// prompt as its first message. A session whose agent runs stays as it is. A
// process the runtime cannot vouch for blocks the start, so two processes
// never share one session directory.
//
// The call answers as soon as the database holds the new attempt. The harness
// launch runs in the background, and the run reads as `starting` until the
// harness confirms the provider session or the launch fails.
export const prepareStart = async (
	ctx: IoCtx,
	input: { id: string },
	deps = { process: sessionProcess, start: startNative, preset: nativePreset },
) => {
	const session = await ctx.newTx((tx) => resolveSession(tx, input.id));
	const release = holdSession(ctx.home, session.runId);
	let launching = false;
	try {
		const stored = await ctx.newTx((tx) => getSession(tx, session.id));
		if (stored.archivedAt !== null) throw archivedSessionRefusal();
		const run = await ctx.newTx((tx) => getRun(tx, session.runId));
		if (run.projectId) assertProjectActive(ctx.core, run.projectId);
		const previous = await deps.process(ctx, run.terminalId);
		// A pause keeps the run open, and the execution service forgets an
		// exited terminal when it starts again. `attemptStopped` reads the
		// output file that the pause wrote, which proves the process of that
		// attempt ended, so a paused session still starts after a restart.
		if (
			previous === null &&
			run.terminalId !== null &&
			run.closedAt === null &&
			!(await attemptStopped(ctx.home, run.id, run.terminalId))
		)
			throw invalidInput("id", "The prior launch is not confirmed. Inspect the agent before another start.");
		if (previous?.status === "running") return { id: session.id };
		if (previous !== null && previous.status !== "exited")
			throw invalidInput("id", "Stop the prior process and confirm it exited before you start the session again.");
		const fresh = run.projectId === null && run.terminalId === null;
		// The runtime forgets an exited attempt when it starts again, and the
		// guard above lets such an attempt through on the record of its
		// output file. `agent_runs.session_id` holds the provider conversation
		// of the last confirmed launch, and `launch.json`, which `deps.preset`
		// reads, holds the harness. So a start after a restart of the runtime
		// still resumes the saved conversation.
		const stopped = previous === null ? run.terminalId !== null : previous.status === "exited";
		const resume =
			stopped &&
			(previous?.agent?.sessionId ?? run.sessionId) != null &&
			(previous === null || previous.launch !== null) &&
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
