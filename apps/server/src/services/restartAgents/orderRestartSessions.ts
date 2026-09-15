import type { RestartSession } from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export async function orderRestartSessions(tx: Tx, sessions: RestartSession[]) {
	if (sessions.length === 0) return [];
	const managers = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM agent_runs WHERE kind='manager' AND id IN (${sql.join(
			sessions.map((entry) => sql`${entry.runId}`),
			sql`,`,
		)})`,
	);
	const ids = new Set(managers.map((run) => run.id));
	return sessions.toSorted((a, b) => Number(ids.has(a.runId)) - Number(ids.has(b.runId)));
}
