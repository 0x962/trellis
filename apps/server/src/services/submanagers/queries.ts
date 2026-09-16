import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { managerScope } from "./scope.ts";

export type Delegation = {
	runId: string;
	parentRunId: string;
	projectId: string;
	capacity: number;
	brief: string;
	retiredAt: string | null;
};
export const columns = sql`run_id AS "runId",parent_run_id AS "parentRunId",project_id AS "projectId",capacity,brief,${iso(sql`retired_at`)} AS "retiredAt"`;
export const getDelegation = async (tx: Tx, id: string) =>
	(await rows<Delegation>(tx, sql`SELECT ${columns} FROM manager_delegations WHERE run_id=${id}`)).at(0);

export const usage = async (tx: Tx, input: { projectId: string; runId: string }) => {
	const [counts] = await rows<{ activeWorkers: number; childCapacity: number }>(
		tx,
		sql`SELECT
		(SELECT count(*)::int FROM agent_runs WHERE project_id IN (${managerScope(input.projectId, true)})
		 AND kind<>'manager' AND runtime='native' AND closed_at IS NULL) AS "activeWorkers",
		(SELECT COALESCE(sum(capacity),0)::int FROM manager_delegations WHERE parent_run_id=${input.runId} AND retired_at IS NULL) AS "childCapacity"`,
	);
	return counts!;
};
