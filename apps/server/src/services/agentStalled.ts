import { sql } from "drizzle-orm";
import type { Tx } from "../db/tx.ts";
import { type AgentsCtx, announce, blockSession, selectSessions } from "./agentSessions.ts";

// The watchdog of the agents host. A tab the runner opened runs the agent
// command line, and the agent calls agents.register in its first turn. An
// agent that never registers is stopped at a prompt: the folder trust
// dialog, a permission question, or a login. The person saw a badge that
// read Starting and nothing else, so the watchdog writes the reason.

// How long a session may stay `starting` before the watchdog calls it
// stopped. A cold Claude start reads its settings and its MCP servers, so
// the wait is generous.
export const STALL_MS = 120_000;

export type StalledPlan = { waiting: string[]; gone: string[] };

// A session the watchdog judges: it holds a terminal and it has read
// `starting` for longer than STALL_MS. agents.register moves a session to
// `running`, so `starting` means the agent never reported itself since
// the start or the restart that wrote the row. The clock is `updated_at`,
// which the restart moves, so a manager the runner started again gets the
// same grace as a new one. A session that already carries a reason is
// left alone, so the watchdog writes each reason once.
export const prepareStalled = async (ctx: AgentsCtx, input: { stallMs?: number }): Promise<StalledPlan> => {
	const stallMs = input.stallMs ?? STALL_MS;
	const since = new Date(ctx.now.getTime() - stallMs);
	const candidates = await ctx.newTx((tx) =>
		selectSessions(
			tx,
			sql`s.state = 'starting' AND s.blocked_reason IS NULL
				AND s.workspace_id IS NOT NULL AND s.terminal_id IS NOT NULL AND s.updated_at <= ${since}`,
		),
	);
	const plan: StalledPlan = { waiting: [], gone: [] };
	for (const workspaceId of new Set(candidates.map((session) => session.workspaceId!))) {
		const tabs = await ctx.runner.terminals(workspaceId);
		for (const session of candidates.filter((found) => found.workspaceId === workspaceId)) {
			const tab = tabs.find((found) => found.terminalId === session.terminalId);
			if (tab === undefined || tab.exited) plan.gone.push(session.id);
			else plan.waiting.push(session.id);
		}
	}
	return plan;
};

// A terminal that still runs holds an agent that waits for an answer. A
// terminal that is gone took its agent with it.
export const stalled = async (ctx: AgentsCtx, tx: Tx, plan: StalledPlan) => {
	for (const id of plan.waiting) {
		await blockSession(ctx, tx, id, { reason: "no-register" });
		await announce(ctx, tx, id);
	}
	if (plan.gone.length > 0) {
		for (const id of plan.gone) {
			await tx.execute(sql`UPDATE agent_sessions SET state = 'exited', updated_at = ${ctx.now} WHERE id = ${id}`);
			await blockSession(ctx, tx, id, { reason: "terminal-exited" });
			await announce(ctx, tx, id);
		}
	}
	return { waiting: plan.waiting.length, gone: plan.gone.length };
};
