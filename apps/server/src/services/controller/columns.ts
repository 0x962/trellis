import { sql } from "drizzle-orm";
import { iso } from "../../db/queries/support.ts";

export const columns = sql`id, project_id AS "projectId", run_id AS "runId", terminal_id AS "terminalId", session_id AS "sessionId", generation, state, events, ${iso(sql`due_at`)} AS "dueAt", error, resolution`;
