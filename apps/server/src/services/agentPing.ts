import { type AgentPing, AgentPingsInputSchema, type AgentPingsOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { insertPing, recentPings } from "../db/queries/agentPings.ts";
import type { Tx } from "../db/tx.ts";
import { type AgentsCtx, announce } from "./agentSessions.ts";
import { findManager, sendToManager } from "./agentWake.ts";
import { resolveProject } from "./refs.ts";

// The heartbeat gives the manager a turn while nothing changes. The text is
// the single word PING; the manager prompt says what to do with it. A ping
// rides the same runner path as a batch, so a manager whose terminal is
// gone is started again before the text goes out.

export const PING_TEXT = "PING";

// `projectId` is the project that owns the manager, which is the project the
// ping row names.
export type PingPlan = { id: string; projectId: string; terminalId: string; restarted: boolean };

export const preparePing = async (ctx: AgentsCtx, input: { project: string }): Promise<PingPlan> => {
	const found = await findManager(ctx, input.project);
	const woken = await sendToManager(ctx, found, PING_TEXT);
	return {
		id: found.manager.id,
		projectId: found.projectId,
		terminalId: woken.terminalId,
		restarted: woken.relaunched,
	};
};

// A ping is not a batch: it sets no `last_woken_at`, so the project header
// keeps showing when the manager last got real work. The session row
// changes only when the runner started the manager again, because that
// manager runs in a new terminal.
export const ping = async (ctx: AgentsCtx, tx: Tx, plan: PingPlan): Promise<AgentPing> => {
	if (plan.restarted) {
		await tx.execute(sql`
			UPDATE agent_sessions SET terminal_id = ${plan.terminalId}, state = 'running', updated_at = ${ctx.now}
			WHERE id = ${plan.id}
		`);
		await announce(ctx, tx, plan.id);
	}
	const written = await insertPing(tx, { projectId: plan.projectId, at: ctx.now, restarted: plan.restarted });
	ctx.emit({ type: "agents.ping", projectId: plan.projectId, restarted: plan.restarted });
	return written;
};

export const pings = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<AgentPingsOutput> => {
	const input = AgentPingsInputSchema.parse(rawInput);
	const project = await resolveProject(ctx, tx, input.project);
	return { pings: await recentPings(tx, { projectId: project.id, limit: input.limit }) };
};
