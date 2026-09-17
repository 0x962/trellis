import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export type Delegation = {
	runId: string;
	parentRunId: string;
	projectId: string;
	brief: string;
	retiredAt: string | null;
};
export const columns = sql`run_id AS "runId",parent_run_id AS "parentRunId",project_id AS "projectId",brief,${iso(sql`retired_at`)} AS "retiredAt"`;
export const getDelegation = async (tx: Tx, id: string) =>
	(await rows<Delegation>(tx, sql`SELECT ${columns} FROM manager_delegations WHERE run_id=${id}`)).at(0);
