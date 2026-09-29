import { type SQL, sql } from "drizzle-orm";

export function observerMembership(runId: SQL) {
	return sql`EXISTS (SELECT 1 FROM session_observers o WHERE o.observer_id=${runId})`;
}
