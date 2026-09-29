import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export type SessionStatusRequestCandidate = {
	sessionId: string;
	runId: string;
	terminalId: string;
};

export const sessionStatusRequestCandidates = (tx: Tx) =>
	rows<SessionStatusRequestCandidate>(
		tx,
		sql`
			SELECT session.id AS "sessionId", run.id AS "runId", run.terminal_id AS "terminalId"
			FROM sessions session
			JOIN agent_runs run ON run.id = session.run_id
			LEFT JOIN projects project ON project.id = run.project_id
			LEFT JOIN tickets ticket ON ticket.id = run.ticket_id
			LEFT JOIN statuses status ON status.id = ticket.status_id
			WHERE session.archived_at IS NULL
				AND run.closed_at IS NULL
				AND run.runtime = 'native'
				AND run.terminal_id IS NOT NULL
				AND run.kind IN ('agent', 'session')
				AND (run.project_id IS NULL OR project.archived_at IS NULL)
				AND (run.kind = 'session' OR (run.ticket_id IS NOT NULL AND status.category NOT IN ('done', 'canceled')))
			ORDER BY session.id
		`,
	);
