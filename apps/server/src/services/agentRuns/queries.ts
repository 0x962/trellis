import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
export type StoredRun = Omit<AgentRun, "assigned" | "state" | "processStatus" | "observation"> & {
	closedAt: string | null;
};
export const columns = sql`id, jsonb_build_object('attemptId', seen_attempt_id, 'sequence', seen_sequence) AS "seenAttention", account_id AS "accountId", name, runtime, harness, kind, instruction,
	project_id AS "projectId", project_path AS "projectPath", ticket_id AS "ticketId", ticket_identifier AS "ticketIdentifier", ${iso(sql`closed_at`)} AS "closedAt",
	(SELECT title FROM tickets WHERE tickets.id=agent_runs.ticket_id) AS "ticketTitle",
	(SELECT statuses.category FROM tickets JOIN statuses ON statuses.id=tickets.status_id WHERE tickets.id=agent_runs.ticket_id) AS "ticketStatusCategory",
	(SELECT epic_id FROM tickets WHERE tickets.id=agent_runs.ticket_id) AS "ticketEpicId",
	(SELECT epics.project_id FROM tickets JOIN epics ON epics.id=tickets.epic_id WHERE tickets.id=agent_runs.ticket_id) AS "ticketEpicProjectId",
	workspace_id AS "workspaceId", terminal_id AS "terminalId", url, error,
	session_id AS "sessionId", session_lost AS "sessionLost",
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;
export const getRun = async (tx: Tx, id: string) => {
	const [run] = await rows<StoredRun>(tx, sql`SELECT ${columns} FROM agent_runs WHERE id = ${id}`);
	if (run === undefined) throw fail("NOT_FOUND", { kind: "agent", ref: id });
	return run;
};

export const listSessionRuns = (tx: Tx) =>
	rows<StoredRun>(tx, sql`SELECT ${columns} FROM agent_runs WHERE id IN (SELECT run_id FROM sessions)`);
