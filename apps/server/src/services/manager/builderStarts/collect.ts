import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { closeUnresumableBuilders } from "./closeUnresumable.ts";
import { queueBuilderStart } from "./queue.ts";

export async function collectBuilderStarts(ctx: ServiceCtx, tx: Tx, sessions: RuntimeProcessStatus[] = []) {
	await closeUnresumableBuilders(ctx, tx, sessions);
	const tickets = await rows<{ id: string; projectId: string }>(
		tx,
		sql`
		SELECT t.id,t.project_id AS "projectId" FROM tickets t JOIN statuses s ON s.id=t.status_id
		WHERE s.category='started'
		AND NOT EXISTS (SELECT 1 FROM agent_runs r WHERE r.ticket_id=t.id AND r.kind='builder' AND (r.closed_at IS NULL OR (r.runtime='native' AND r.terminal_id IS NOT NULL AND r.session_id IS NOT NULL AND r.workspace_id IS NOT NULL AND NOT r.session_lost)))
		AND NOT EXISTS (SELECT 1 FROM builder_start_requests r WHERE r.ticket_id=t.id AND (r.state IN ('pending','launching') OR (r.state='failed' AND coalesce(r.retry_at,r.created_at+interval '2 minutes') > ${ctx.now})))
		AND NOT EXISTS (SELECT 1 FROM flow_executions f WHERE f.ticket_id=t.id AND f.state->>'status' IN ('running','waiting'))
		AND NOT EXISTS (SELECT 1 FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb)
		AND NOT EXISTS (WITH RECURSIVE ancestors AS (
			SELECT id,parent_id,archived_at,manager_config FROM projects WHERE id=t.project_id
			UNION ALL SELECT p.id,p.parent_id,p.archived_at,p.manager_config FROM projects p JOIN ancestors a ON p.id=a.parent_id
		) SELECT id FROM ancestors WHERE archived_at IS NOT NULL)
		ORDER BY t.created_at,t.id`,
	);
	for (const ticket of tickets) {
		await queueBuilderStart(ctx, tx, { ticketId: ticket.id, projectId: ticket.projectId, category: "started" });
	}
}
