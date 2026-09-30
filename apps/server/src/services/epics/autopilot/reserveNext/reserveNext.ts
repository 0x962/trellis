import type { EpicAutopilot } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../../context.ts";
import { rows } from "../../../../db/queries/support.ts";
import type { Tx } from "../../../../db/tx.ts";
import { reserve } from "../../../agentRuns/reserve.ts";
import { update } from "../../../tickets/update.ts";

export async function reserveNext(ctx: ServiceCtx, tx: Tx, input: { epicId: string }) {
	const [epic] = await rows<{ autopilot: EpicAutopilot }>(
		tx,
		sql`SELECT e.autopilot FROM epics e JOIN projects p ON p.id = e.project_id
			WHERE e.id = ${input.epicId} AND e.autopilot->>'enabled' = 'true'
			AND e.canceled_at IS NULL AND p.archived_at IS NULL`,
	);
	if (!epic) return null;
	const [capacity] = await rows<{ used: number }>(
		tx,
		sql`SELECT count(*)::int AS used FROM tickets t JOIN statuses s ON s.id = t.status_id
			WHERE t.epic_id = ${input.epicId} AND s.category IN ('todo', 'started')
			AND EXISTS (SELECT 1 FROM agent_runs r
				WHERE r.ticket_id = t.id AND r.kind = 'agent' AND r.closed_at IS NULL)`,
	);
	if (capacity!.used >= epic.autopilot.maxConcurrency) return null;
	const [ticket] = await rows<{ id: string }>(
		tx,
		sql`SELECT t.id FROM tickets t JOIN statuses s ON s.id = t.status_id
			LEFT JOIN waves w ON w.id = t.wave_id
			WHERE t.epic_id = ${input.epicId} AND s.category = 'todo'
			AND NOT EXISTS (SELECT 1 FROM agent_runs r
				WHERE r.ticket_id = t.id AND r.kind = 'agent' AND r.closed_at IS NULL)
			AND NOT EXISTS (SELECT 1 FROM ticket_deps d
				JOIN tickets blocker ON blocker.id = d.depends_on_id
				JOIN statuses bs ON bs.id = blocker.status_id
				WHERE d.ticket_id = t.id AND bs.category NOT IN ('done', 'canceled'))
			ORDER BY w.position NULLS LAST, t.position, t.number LIMIT 1`,
	);
	if (!ticket) return null;
	// The reservation and status change consume one slot in this transaction.
	const reservation = await reserve(ctx, tx, {
		ticket: ticket.id,
		harness: epic.autopilot.harness,
		accountId: epic.autopilot.accountId ?? undefined,
	});
	await update(ctx, tx, { ticket: ticket.id, status: "category:started" });
	return reservation;
}
