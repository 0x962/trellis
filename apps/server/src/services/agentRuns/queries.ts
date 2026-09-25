import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { latestExecutionAttemptAt } from "../assignments.ts";
// One row of `agent_runs` as the server reads it. `instruction` is the full
// prompt the harness launches with, up to 200000 characters. `listColumns`
// leaves it out, so a row that a list query read carries no instruction and
// the type marks it optional.
export type StoredRun = Omit<AgentRun, "assigned" | "state" | "processStatus" | "observation"> & {
	closedAt: string | null;
	instruction?: string;
};
// A row that carries the prompt. Only a launch, a resume, and a retry read one.
export type LaunchRun = StoredRun & { instruction: string };
export const listColumns = sql`id, jsonb_build_object('attemptId', seen_attempt_id, 'sequence', seen_sequence) AS "seenAttention", account_id AS "accountId", name, runtime, harness, kind,
	(SELECT target->>'switchedTo' FROM agent_start_requests WHERE run_id=agent_runs.id AND target->>'switchedTo' IS NOT NULL ORDER BY created_at DESC LIMIT 1) AS "switchedTo",
	project_id AS "projectId", project_key AS "projectKey", ticket_id AS "ticketId", ticket_identifier AS "ticketIdentifier", ${iso(sql`closed_at`)} AS "closedAt",
	${iso(sql`pinned_at`)} AS "pinnedAt",
	(SELECT title FROM tickets WHERE tickets.id=agent_runs.ticket_id) AS "ticketTitle",
	(SELECT statuses.category FROM tickets JOIN statuses ON statuses.id=tickets.status_id WHERE tickets.id=agent_runs.ticket_id) AS "ticketStatusCategory",
	(SELECT epic_id FROM tickets WHERE tickets.id=agent_runs.ticket_id) AS "ticketEpicId",
	(SELECT epics.project_id FROM tickets JOIN epics ON epics.id=tickets.epic_id WHERE tickets.id=agent_runs.ticket_id) AS "ticketEpicProjectId",
	workspace_id AS "workspaceId", terminal_id AS "terminalId", url, error,
	session_id AS "sessionId", session_lost AS "sessionLost",
	${iso(sql`GREATEST(activity_at, closed_at)`)} AS "activityAt",
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;
export const columns = sql`${listColumns}, instruction`;

export const storedRows = async <T extends StoredRun>(tx: Tx, query: ReturnType<typeof sql>) => {
	const runs = await rows<T>(tx, query);
	const attempts = new Map(
		(
			await latestExecutionAttemptAt(
				tx,
				runs.map((run) => run.id),
			)
		).map((attempt) => [attempt.runId, attempt.activityAt]),
	);
	return runs.map((run) => {
		const attemptAt = attempts.get(run.id);
		return attemptAt !== undefined && (run.activityAt === null || attemptAt > run.activityAt)
			? { ...run, activityAt: attemptAt }
			: run;
	});
};

export const storeObservedActivity = async (tx: Tx, values: Array<{ id: string; activityAt: string }>) => {
	if (values.length === 0) return;
	await tx.execute(sql`UPDATE agent_runs AS run SET activity_at=observed.activity_at
			FROM (
				SELECT * FROM unnest(
					${sql.param(values.map((value) => value.id))}::text[],
					${sql.param(values.map((value) => value.activityAt))}::timestamptz[]
				) AS value(id, activity_at)
			) AS observed
			WHERE run.id=observed.id AND (run.activity_at IS NULL OR run.activity_at < observed.activity_at)`);
};

export const getRun = async (tx: Tx, id: string) => {
	const [run] = await storedRows<LaunchRun>(tx, sql`SELECT ${columns} FROM agent_runs WHERE id = ${id}`);
	if (run === undefined) throw fail("NOT_FOUND", { kind: "agent", ref: id });
	return run;
};

export const listSessionRuns = (tx: Tx) =>
	storedRows<StoredRun>(tx, sql`SELECT ${listColumns} FROM agent_runs WHERE id IN (SELECT run_id FROM sessions)`);
