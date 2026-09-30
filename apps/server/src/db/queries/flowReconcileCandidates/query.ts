import { sql } from "drizzle-orm";
import { flowReconcilePredicate } from "../../flowReconcilePredicate";

export const query = sql`
	SELECT id FROM (
		SELECT e.id, e.created_at FROM flow_executions e
		WHERE ${flowReconcilePredicate(sql`e.state`)}
		UNION
		SELECT e.id, e.created_at FROM agent_runs r
		JOIN flow_execution_tasks t ON t.run_id = r.id
		JOIN flow_executions e ON e.id = t.execution_id
		WHERE r.closed_at IS NULL
			AND (t.result_id IS NOT NULL OR e.state->>'status' = 'failed')
	) candidates ORDER BY created_at, id
`;
