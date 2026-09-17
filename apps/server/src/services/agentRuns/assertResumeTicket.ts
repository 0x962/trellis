import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import type { StoredRun } from "./queries.ts";

export const assertResumeTicket = async (tx: Tx, run: StoredRun, automatic = false) => {
	const [ticket] =
		run.ticketId === null
			? []
			: await rows<{ category: string }>(
					tx,
					sql`SELECT s.category FROM tickets t JOIN statuses s ON s.id=t.status_id WHERE t.id=${run.ticketId}`,
				);
	if (ticket?.category === "todo")
		throw invalidInput("ticket", "Move the ticket out of Todo before you resume an agent.");
	if (automatic && (run.kind !== "builder" || ticket?.category !== "started"))
		throw invalidInput("id", "This builder no longer permits automatic resume.");
	if (automatic) {
		if (run.closedAt !== null) {
			const owners = await rows(
				tx,
				sql`SELECT id FROM agent_runs WHERE ticket_id=${run.ticketId} AND kind='builder' AND id<>${run.id} AND closed_at IS NULL LIMIT 1`,
			);
			if (owners.length > 0) throw invalidInput("id", "Another builder already owns this ticket.");
		}
		const archived = await rows(
			tx,
			sql`WITH RECURSIVE ancestors AS (
			SELECT id,parent_id,archived_at FROM projects WHERE id=${run.projectId}
			UNION ALL SELECT p.id,p.parent_id,p.archived_at FROM projects p JOIN ancestors child ON p.id=child.parent_id
		) SELECT id FROM ancestors WHERE archived_at IS NOT NULL LIMIT 1`,
		);
		if (archived.length > 0)
			throw invalidInput("project", "Automatic builder work is unavailable for an archived project.");
	}
};
