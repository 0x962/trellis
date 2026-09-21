import { type AgentRunRetryInput, HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import { recordRequest, replayRequest } from "../assignments/requests.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { assertProjectActive } from "../refs.ts";
import type { IoCtx } from "../support.ts";
import { launchRun } from "./launchRun";
import { startNative } from "./nativeStart.ts";
import { getRun, type StoredRun } from "./queries.ts";

type RuntimeStatus = Awaited<ReturnType<ReturnType<typeof nativeHost>["status"]>>;

const retryableStatus = async (home: string, attemptId: string): Promise<RuntimeStatus | null> => {
	try {
		return await nativeHost(home).status(attemptId);
	} catch (error) {
		if (["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
		throw error;
	}
};

const assertTicketOpen = async (tx: Tx, run: StoredRun) => {
	const [ticket] = await rows<{ completed_at: string | null }>(
		tx,
		sql`SELECT completed_at FROM tickets WHERE id=${run.ticketId}`,
	);
	if (!ticket) throw invalidInput("ticket", "This assignment has no ticket.");
	if (ticket.completed_at !== null) throw invalidInput("ticket", "Reopen the ticket before an agent starts.");
};

export async function prepareRetry(ctx: IoCtx, input: AgentRunRetryInput, start: typeof startNative = startNative) {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.terminalId !== input.expectedTerminalId)
		throw invalidInput(
			"expectedTerminalId",
			"This assignment has another attempt. Read its current run before you retry.",
		);
	if (run.kind !== "agent" || run.runtime !== "native" || run.projectId === null || run.ticketId === null)
		throw invalidInput("id", "Retry applies to native ticket agents only.");
	if (run.closedAt !== null) throw invalidInput("id", "Assign the ticket before you retry this run.");
	if (run.harness === null) throw invalidInput("id", "This assignment has no saved harness.");
	const status = await retryableStatus(ctx.home, input.expectedTerminalId);
	if (status?.status === "running") throw invalidInput("id", "Stop the current process before you retry this run.");
	const target = {
		projectId: run.projectId,
		ticketId: run.ticketId,
		newSession: false,
		resumeRunId: run.id,
		previousAttemptId: input.expectedTerminalId,
	};
	const request = { requestId: input.requestId, target };
	const reservation = await ctx.newTx(async (tx) => {
		await tx.execute(sql`SELECT id FROM projects WHERE id=${run.projectId} FOR UPDATE`);
		const replay = await replayRequest(ctx.core, tx, request);
		if (replay) return { replay: true as const, run: replay };
		const current = await getRun(tx, input.id);
		if (current.terminalId !== input.expectedTerminalId)
			throw invalidInput("expectedTerminalId", "Another call already replaced this attempt.");
		if (current.closedAt !== null) throw invalidInput("id", "Assign the ticket before you retry this run.");
		assertProjectActive(ctx.core, current.projectId!);
		await assertTicketOpen(tx, current);
		const attempt = await reserveAttempt(ctx.core, tx, { runId: current.id });
		const harness = HarnessSchema.parse(current.harness);
		await tx.execute(
			sql`UPDATE agent_runs SET terminal_id=${attempt.id}, error=NULL, session_lost=false, updated_at=${ctx.core.now} WHERE id=${current.id}`,
		);
		await recordRequest(ctx.core, tx, { ...request, runId: current.id });
		return {
			replay: false as const,
			run: { ...current, terminalId: attempt.id, error: null, sessionLost: false },
			attempt,
			config: await projectLaunchConfig(tx, { projectId: current.projectId!, harness }),
		};
	});
	if (reservation.replay) return { id: reservation.run.id };
	ctx.emit({ type: "agent-runs.changed", id: reservation.run.id });
	launchRun(ctx, reservation.run.id, reservation.attempt.id, (background) =>
		start(background, {
			run: reservation.run,
			config: reservation.config,
			resume: false,
			attempt: reservation.attempt,
			previousAttemptId: input.expectedTerminalId,
			previousAccountId: run.accountId ?? null,
			preserveAssignmentOnFailure: true,
		}),
	);
	return { id: reservation.run.id };
}
