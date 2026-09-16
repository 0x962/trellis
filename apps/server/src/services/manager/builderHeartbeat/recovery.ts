import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { prepareResume } from "../../agentRuns/resume.ts";
import type { IoCtx } from "../../support.ts";
import type { ManagerCtx, ManagerInput } from "../types.ts";
import { recordHeartbeat } from "./collect.ts";

export const collectRecovery = async (ctx: ManagerCtx, tx: Tx, input: ManagerInput) => {
	const quietBefore = new Date(ctx.now.getTime() - 120_000);
	const exited = input.sessions
		.filter(
			(session) =>
				session.status === "exited" && session.agent?.sessionId && session.launch && session.endedAt !== null,
		)
		.map((session) => ({ id: session.id, endedAt: session.endedAt }));
	if (exited.length === 0) return [];
	return rows<{ runId: string; terminalId: string }>(
		tx,
		sql`WITH candidates AS (
		SELECT r.id AS "runId",r.terminal_id AS "terminalId",r.closed_at,r.created_at,h.sent_at,live."endedAt",
		row_number() OVER (PARTITION BY r.ticket_id ORDER BY r.created_at DESC,r.id DESC) AS position
		FROM agent_runs r
		JOIN tickets t ON t.id=r.ticket_id JOIN statuses s ON s.id=t.status_id AND s.category='started'
		JOIN projects p ON p.id=r.project_id LEFT JOIN builder_heartbeats h ON h.run_id=r.id
		JOIN jsonb_to_recordset(${JSON.stringify(exited)}::jsonb) AS live(id text, "endedAt" timestamptz) ON live.id=r.terminal_id
		WHERE r.kind='builder' AND r.runtime='native' AND r.persona_id IS NOT NULL
		AND (r.closed_at IS NULL OR NOT EXISTS (
			SELECT 1 FROM agent_runs owner WHERE owner.ticket_id=r.ticket_id AND owner.kind='builder' AND owner.closed_at IS NULL
		))
		AND NOT EXISTS (SELECT 1 FROM flow_execution_tasks task WHERE task.run_id=r.id)
		AND NOT EXISTS (SELECT 1 FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb)
		AND NOT EXISTS (WITH RECURSIVE ancestors AS (
			SELECT id,parent_id,archived_at FROM projects WHERE id=p.id
			UNION ALL SELECT parent.id,parent.parent_id,parent.archived_at FROM projects parent JOIN ancestors child ON parent.id=child.parent_id
		) SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL)
		) SELECT "runId","terminalId" FROM candidates
		WHERE (closed_at IS NULL OR position=1) AND "endedAt" < ${quietBefore}
		AND (sent_at IS NULL OR sent_at < ${quietBefore})
		ORDER BY sent_at NULLS FIRST,created_at,"runId" LIMIT 20`,
	);
};

export const dispatchBuilderRecovery = async (ctx: IoCtx, sessions: RuntimeProcessStatus[], resume = prepareResume) => {
	const control = { now: ctx.now() };
	const candidates = await ctx.newTx((tx) => collectRecovery(control, tx, { sessions }));
	const results = await Promise.allSettled(
		candidates.map(async (candidate) => {
			await ctx.newTx((tx) => recordHeartbeat(control, tx, candidate.runId));
			await resume(ctx, {
				id: candidate.runId,
				expectedTerminalId: candidate.terminalId,
				requestId: `builder-recovery:${candidate.terminalId}`,
				automatic: true,
			});
		}),
	);
	const failures = results.flatMap((result, index) =>
		result.status === "rejected" ? [{ runId: candidates[index]!.runId, error: result.reason }] : [],
	);
	if (failures.length > 0)
		throw new AggregateError(
			failures.map((failure) => failure.error),
			failures
				.map(({ runId, error }) => `${runId}: ${error instanceof Error ? error.message : String(error)}`)
				.join("; "),
		);
};
