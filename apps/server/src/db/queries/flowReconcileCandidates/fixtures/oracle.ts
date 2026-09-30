import { sql } from "drizzle-orm";

// This independent predicate defines the candidate set that recovery must preserve.
export const oracle = sql`
	SELECT id FROM flow_executions e
	WHERE e.state->>'status' IN ('running', 'waiting')
		OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.state->'steps') s WHERE s->>'needsStop'='true')
		OR EXISTS (
			SELECT 1 FROM flow_execution_tasks t JOIN agent_runs r ON r.id=t.run_id
			WHERE t.execution_id=e.id AND (t.result_id IS NOT NULL OR e.state->>'status'='failed')
				AND r.closed_at IS NULL
		)
	ORDER BY created_at, id
`;
