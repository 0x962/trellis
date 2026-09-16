import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
export type StoredRun = Omit<AgentRun, "state" | "processStatus" | "observation" | "metrics"> & {
	closedAt: string | null;
};
export type StoredAttempt = { id: string; runId: string };
export const columns = sql`id, persona_name AS name, runtime, persona_id AS "personaId", persona_name AS "personaName", kind, instruction,
	project_id AS "projectId", project_path AS "projectPath", ticket_id AS "ticketId", ticket_identifier AS "ticketIdentifier", ${iso(sql`closed_at`)} AS "closedAt",
	workspace_id AS "workspaceId", terminal_id AS "terminalId", url, error,
	session_id AS "sessionId", session_lost AS "sessionLost",
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;
export const getRun = async (tx: Tx, id: string) => {
	const [run] = await rows<StoredRun>(tx, sql`SELECT ${columns} FROM agent_runs WHERE id = ${id}`);
	if (run === undefined) throw fail("NOT_FOUND", { kind: "agent", ref: id });
	return run;
};

export const listAttempts = (tx: Tx, runIds: string[]) =>
	runIds.length === 0
		? Promise.resolve([] as StoredAttempt[])
		: rows<StoredAttempt>(
				tx,
				sql`SELECT id, run_id AS "runId" FROM agent_execution_attempts WHERE run_id = ANY(${textArray(runIds)}) ORDER BY generation`,
			);
