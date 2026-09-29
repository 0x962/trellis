import { type SQL, sql } from "drizzle-orm";
export function observerConversationIdentities(runId: SQL, currentSessionId: SQL) {
	return sql`SELECT ${currentSessionId} AS session_id
		UNION
		SELECT target->>'providerSessionId' FROM agent_start_requests
		WHERE run_id=${runId} AND actor_kind='system' AND actor_name='session-observer'`;
}
