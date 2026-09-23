import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import type { LaunchRun, StoredRun } from "./types.ts";
export const storedColumns = sql`id, jsonb_build_object('attemptId', seen_attempt_id, 'sequence', seen_sequence) AS "seenAttention", account_id AS "accountId", name, runtime, harness, kind,
	(SELECT target->>'switchedTo' FROM agent_start_requests WHERE run_id=agent_runs.id AND target->>'switchedTo' IS NOT NULL ORDER BY created_at DESC LIMIT 1) AS "switchedTo",
	project_id AS "projectId", project_key AS "projectKey", ticket_id AS "ticketId", ticket_identifier AS "ticketIdentifier", ${iso(sql`closed_at`)} AS "closedAt",
	(SELECT title FROM tickets WHERE tickets.id=agent_runs.ticket_id) AS "ticketTitle",
	(SELECT statuses.category FROM tickets JOIN statuses ON statuses.id=tickets.status_id WHERE tickets.id=agent_runs.ticket_id) AS "ticketStatusCategory",
	(SELECT epic_id FROM tickets WHERE tickets.id=agent_runs.ticket_id) AS "ticketEpicId",
	(SELECT epics.project_id FROM tickets JOIN epics ON epics.id=tickets.epic_id WHERE tickets.id=agent_runs.ticket_id) AS "ticketEpicProjectId",
	workspace_id AS "workspaceId", terminal_id AS "terminalId", url, error,
	session_id AS "sessionId", session_lost AS "sessionLost",
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;
export const launchColumns = sql`${storedColumns}, instruction`;
export const getRun = async (tx: Tx, id: string) => {
	const [run] = await rows<LaunchRun>(tx, sql`SELECT ${launchColumns} FROM agent_runs WHERE id = ${id}`);
	if (run === undefined) throw fail("NOT_FOUND", { kind: "agent", ref: id });
	return run;
};

// One run without its prompt. The flow reconcile loop reads a run once per
// open task every second, and it reads no prompt, so it uses this.
export const getStoredRun = async (tx: Tx, id: string) => {
	const [run] = await rows<StoredRun>(tx, sql`SELECT ${storedColumns} FROM agent_runs WHERE id = ${id}`);
	if (run === undefined) throw fail("NOT_FOUND", { kind: "agent", ref: id });
	return run;
};

// Every agent run that no one has closed. `needsYou` and the statistics
// faults read this set to decide something, not to draw a list, so it
// carries no limit: a row that a limit hides changes their answer, and the
// statistics fault names the oldest run of the set. Only a person removes
// the assignment of an agent run, so the set can hold any number of rows.
export const openAgentRuns = (tx: Tx) =>
	rows<StoredRun>(
		tx,
		sql`SELECT ${storedColumns} FROM agent_runs WHERE closed_at IS NULL AND kind = 'agent'
		ORDER BY created_at DESC, id DESC`,
	);

export const listSessionRuns = (tx: Tx) =>
	rows<StoredRun>(tx, sql`SELECT ${storedColumns} FROM agent_runs WHERE id IN (SELECT run_id FROM sessions)`);
