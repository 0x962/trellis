import { type SQLWrapper, sql } from "drizzle-orm";

// The query and partial index share this predicate so PostgreSQL can select the index.
export const flowReconcilePredicate = (state: SQLWrapper) =>
	sql`${state}->>'status' IN ('running', 'waiting') OR ${state} @? 'strict $.steps[*] ? (@.needsStop == true || @.needsStop == "true")'::jsonpath`;
