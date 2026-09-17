import { randomUUID } from "node:crypto";
import { DEFAULT_PROJECT_MANAGER_CONFIG } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativePreset } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertNativeWorkEnabled } from "../agentRuns/nativeControl.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { columns, getRun, type StoredRun } from "../agentRuns/queries.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import type { IoCtx } from "../support.ts";
import { sessionProcess } from "./process.ts";
import { getSession } from "./queries.ts";

// Starts the agent of a stopped session again. The harness resumes its
// saved conversation when the previous process confirmed one for the same
// harness. Otherwise the agent starts fresh in the same directory, with the
// original prompt as its first message. A session whose agent runs stays as
// it is. A process the runtime cannot vouch for blocks the start, so two
// processes never share one session directory.
export const prepareStart = async (ctx: IoCtx, input: { id: string }) => {
	const session = await ctx.newTx((tx) => getSession(tx, input.id));
	const run = await ctx.newTx((tx) => getRun(tx, session.runId));
	const previous = await sessionProcess(ctx, run.terminalId);
	if (previous?.status === "running") return { id: session.id };
	if (previous !== null && previous.status !== "exited")
		throw invalidInput("id", "Stop the prior process and confirm it exited before you start the session again.");
	const resume =
		previous?.status === "exited" &&
		previous.agent?.sessionId != null &&
		previous.launch !== null &&
		session.harness.preset !== "custom" &&
		(await nativePreset(ctx.home, run.terminalId!)) === session.harness.preset;
	const reservation = await ctx.newTx(async (tx) => {
		await assertNativeWorkEnabled(tx);
		await upsert(ctx.core, tx, ctx.actor);
		const selected = await selectAccount(tx, {
			accountId: run.accountId,
			config: { ...DEFAULT_PROJECT_MANAGER_CONFIG, directory: session.directory, harness: session.harness },
			useDefault: !resume,
		});
		const attempt = await reserveAttempt(ctx.core, tx, { runId: run.id });
		const [updated] = await rows<StoredRun>(
			tx,
			sql`UPDATE agent_runs SET closed_at = NULL, error = NULL, session_lost = false, terminal_id = ${attempt.id}, account_id = ${selected.accountId},
			session_id = ${resume ? run.sessionId : session.harness.preset === "custom" ? randomUUID() : null}, updated_at = ${ctx.now()}
			WHERE id = ${run.id} RETURNING ${columns}`,
		);
		return { run: updated!, config: selected.config, attempt };
	});
	ctx.emit({ type: "sessions.changed", id: session.id });
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	await startNative(ctx, {
		run: reservation.run,
		config: reservation.config,
		resume,
		previousAttemptId: resume ? run.terminalId : null,
		previousAccountId: run.accountId ?? null,
		context: "",
		attempt: reservation.attempt,
		resumePrompt: resume ? "Continue this session in the same conversation and workspace." : undefined,
	});
	return { id: session.id };
};
