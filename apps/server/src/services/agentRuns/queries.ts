import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
export type StoredRun = Omit<AgentRun, "state" | "processStatus" | "observation"> & { closedAt: string | null };
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
