import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export async function closeUnresumableBuilders(ctx: ServiceCtx, tx: Tx, sessions: RuntimeProcessStatus[]) {
	const exited = sessions
		.filter((session) => session.status === "exited" && !session.agent?.sessionId)
		.map((session) => session.id);
	if (exited.length === 0) return;
	const error = "The builder exited without a saved conversation. Trellis retries after two minutes.";
	const closed = await rows<{ id: string; ticket_id: string }>(
		tx,
		sql`
		UPDATE agent_runs r SET closed_at=${ctx.now},updated_at=${ctx.now},error=${error}
		WHERE r.kind='builder' AND r.runtime='native' AND r.closed_at IS NULL AND (r.session_id IS NULL OR r.session_lost)
		AND r.terminal_id IN (${sql.join(
			exited.map((id) => sql`${id}`),
			sql`,`,
		)})
		AND EXISTS (SELECT 1 FROM tickets t JOIN statuses s ON s.id=t.status_id WHERE t.id=r.ticket_id AND s.category='started')
		AND NOT EXISTS (SELECT 1 FROM flow_execution_tasks f WHERE f.run_id=r.id)
		AND NOT EXISTS (SELECT 1 FROM settings WHERE key='nativeWorkPaused' AND value='true'::jsonb)
		AND NOT EXISTS (WITH RECURSIVE ancestors AS (
			SELECT id,parent_id,archived_at FROM projects WHERE id=r.project_id
			UNION ALL SELECT p.id,p.parent_id,p.archived_at FROM projects p JOIN ancestors a ON p.id=a.parent_id
		) SELECT id FROM ancestors WHERE archived_at IS NOT NULL)
		RETURNING r.id,r.ticket_id`,
	);
	for (const run of closed) {
		const retryAt = new Date(ctx.now.getTime() + 120_000);
		const requests = await rows(
			tx,
			sql`UPDATE builder_start_requests SET state='failed',error=${error},retry_at=${retryAt} WHERE run_id=${run.id} AND state IN ('launching','assigned') RETURNING id`,
		);
		if (requests.length === 0)
			await tx.execute(
				sql`INSERT INTO builder_start_requests (id,ticket_id,run_id,state,error,retry_at,created_at) VALUES (${ulid()},${run.ticket_id},${run.id},'failed',${error},${retryAt},${ctx.now})`,
			);
		ctx.emit({ type: "agent-runs.changed", id: run.id });
	}
}
