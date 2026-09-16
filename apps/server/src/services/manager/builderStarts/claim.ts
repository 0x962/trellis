import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { SYSTEM_ACTOR } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { reserve } from "../../agentRuns/reserve.ts";
import { projectLaunchConfig } from "../../projectLaunchConfig/projectLaunchConfig.ts";

export async function claimBuilderStart(ctx: ServiceCtx, tx: Tx, id: string) {
	const [request] = await rows<{ ticket_id: string; project_id: string; category: string }>(
		tx,
		sql`
		SELECT r.ticket_id,t.project_id,s.category FROM builder_start_requests r
		JOIN tickets t ON t.id=r.ticket_id JOIN statuses s ON s.id=t.status_id
		WHERE r.id=${id} AND r.state='pending' FOR UPDATE OF r`,
	);
	if (!request) return null;
	const existing = await rows(
		tx,
		sql`SELECT id FROM agent_runs WHERE ticket_id=${request.ticket_id} AND kind='builder' AND (closed_at IS NULL OR (runtime='native' AND terminal_id IS NOT NULL AND session_id IS NOT NULL AND workspace_id IS NOT NULL AND NOT session_lost))`,
	);
	const flow = await rows(
		tx,
		sql`SELECT id FROM flow_executions WHERE ticket_id=${request.ticket_id} AND state->>'status' IN ('running','waiting')`,
	);
	const config = await projectLaunchConfig(tx, { projectId: request.project_id });
	if (request.category !== "started" || existing.length > 0 || flow.length > 0 || !config.builder?.personaId) {
		await tx.execute(sql`UPDATE builder_start_requests SET state='canceled' WHERE id=${id}`);
		return null;
	}
	const paused = await rows(
		tx,
		sql`WITH RECURSIVE ancestors AS (
		SELECT id,parent_id,archived_at,manager_config FROM projects WHERE id=${request.project_id}
		UNION ALL SELECT p.id,p.parent_id,p.archived_at,p.manager_config FROM projects p JOIN ancestors a ON p.id=a.parent_id
	) SELECT id FROM ancestors WHERE archived_at IS NOT NULL
	UNION ALL SELECT key AS id FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb`,
	);
	if (paused.length > 0) return null;
	const claim = await reserve({ ...ctx, actor: SYSTEM_ACTOR }, tx, {
		ticket: request.ticket_id,
		personaId: config.builder.personaId,
		harness: config.builder.harness,
		requestId: `builder-start:${id}`,
	});
	await tx.execute(sql`UPDATE builder_start_requests SET state='launching',run_id=${claim.run.id} WHERE id=${id}`);
	return claim.replay ? null : claim;
}
