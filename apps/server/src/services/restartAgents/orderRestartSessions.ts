import type { RestartSession } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

// Two waves: every worker first, then every manager. A manager that comes
// back after its workers sees them running on its first heartbeat.
export async function orderRestartSessions(tx: Tx, sessions: RestartSession[]): Promise<RestartSession[][]> {
	if (sessions.length === 0) return [];
	const managers = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM agent_runs WHERE kind='manager' AND id IN (${sql.join(
			sessions.map((entry) => sql`${entry.runId}`),
			sql`,`,
		)})`,
	);
	const ids = new Set(managers.map((run) => run.id));
	const workers = sessions.filter((entry) => !ids.has(entry.runId));
	const waves = [workers, sessions.filter((entry) => ids.has(entry.runId))];
	return waves.filter((wave) => wave.length > 0);
}
