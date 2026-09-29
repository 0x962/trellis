import { sql } from "drizzle-orm";
import type { Tx } from "../../db/tx.ts";
import { listColumns, type StoredRun, storedRows } from "./queries.ts";

export const openAgentRuns = (tx: Tx) =>
	storedRows<StoredRun>(
		tx,
		sql`SELECT ${listColumns} FROM agent_runs
			WHERE kind = 'agent' AND closed_at IS NULL
			ORDER BY updated_at DESC, id DESC`,
	);

export const unresolvedAttemptRuns = (tx: Tx, terminalIds: string[]) => {
	const observed =
		terminalIds.length === 0
			? sql`false`
			: sql`terminal_id IN (${sql.join(
					terminalIds.map((id) => sql`${id}`),
					sql`, `,
				)})`;
	return storedRows<StoredRun>(
		tx,
		sql`SELECT ${listColumns} FROM agent_runs
			WHERE runtime = 'native' AND (closed_at IS NULL OR ${observed})
			ORDER BY updated_at DESC, id DESC`,
	);
};
