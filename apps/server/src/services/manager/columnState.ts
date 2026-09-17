import type { StatusAgentConfig } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export type ColumnState = {
	ticketId: string;
	projectId: string;
	statusId: string;
	agentConfig: StatusAgentConfig | null;
	runId: string | null;
	assignedStatusId: string | null;
	retired: boolean | null;
	heartbeatAt: Date | null;
	allowed: boolean;
};

export async function columnStates(tx: Tx, ticketId?: string) {
	return rows<ColumnState>(
		tx,
		sql`
		SELECT t.id AS "ticketId",t.project_id AS "projectId",t.status_id AS "statusId",s.agent_config AS "agentConfig",
		w.run_id AS "runId",w.status_id AS "assignedStatusId",w.retired,w.heartbeat_at AS "heartbeatAt",
		(NOT EXISTS (
			WITH RECURSIVE ancestors AS (
				SELECT id,parent_id,archived_at FROM projects WHERE id=t.project_id
				UNION ALL SELECT p.id,p.parent_id,p.archived_at FROM projects p JOIN ancestors a ON p.id=a.parent_id
			) SELECT 1 FROM ancestors WHERE archived_at IS NOT NULL
		) AND NOT EXISTS (SELECT 1 FROM flow_executions f WHERE f.ticket_id=t.id AND f.state->>'status' IN ('running','waiting'))) AS allowed
		FROM tickets t JOIN statuses s ON s.id=t.status_id LEFT JOIN column_workers w ON w.ticket_id=t.id
		WHERE ${ticketId ? sql`t.id=${ticketId}` : sql`(s.agent_config IS NOT NULL OR w.ticket_id IS NOT NULL)`}
		ORDER BY t.created_at,t.id`,
	);
}
