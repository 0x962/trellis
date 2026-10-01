import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";

export const participantLabels = async (tx: Tx, ids: readonly string[]): Promise<Map<string, string>> => {
	const unique = [...new Set(ids)];
	const labels = new Map(unique.map((id) => [id, `Agent ${id.slice(-6)}`]));
	if (unique.length === 0) return labels;
	const found = await rows<{ id: string; label: string | null }>(
		tx,
		sql`SELECT r.id, coalesce(r.ticket_identifier, p.key || '-' || t.number, s.name) AS label
		FROM agent_runs r
		LEFT JOIN tickets t ON t.id=r.ticket_id
		LEFT JOIN projects p ON p.id=t.project_id
		LEFT JOIN sessions s ON s.run_id=r.id
		WHERE r.id IN (${sql.join(
			unique.map((id) => sql`${id}`),
			sql`, `,
		)})`,
	);
	for (const { id, label } of found) if (label !== null) labels.set(id, label);
	return labels;
};
