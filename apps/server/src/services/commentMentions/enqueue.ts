import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { mentionedNames } from "./mentioned.ts";

type Recipient = {
	personaId: string | null;
	personaName: string;
	runId: string | null;
	terminalId: string | null;
	sessionId: string | null;
};

export const enqueue = async (
	tx: Tx,
	input: {
		commentId: string;
		ticketId: string;
		projectId: string;
		body: string;
		previousBody?: string;
	},
) => {
	if (!input.body.includes("@")) return;
	const recipients = await rows<Recipient>(
		tx,
		sql`SELECT p.id AS "personaId",p.name AS "personaName",r.id AS "runId",
			r.terminal_id AS "terminalId",r.session_id AS "sessionId"
		FROM personas p LEFT JOIN LATERAL (
			SELECT id,terminal_id,session_id FROM agent_runs
			WHERE persona_id=p.id AND runtime='native' AND closed_at IS NULL
			AND ((p.kind='manager' AND project_id=${input.projectId}) OR (p.kind<>'manager' AND ticket_id=${input.ticketId}))
			ORDER BY created_at DESC,id DESC LIMIT 1
		) r ON true
		UNION ALL
		SELECT NULL AS "personaId",r.persona_name AS "personaName",r.id AS "runId",
			r.terminal_id AS "terminalId",r.session_id AS "sessionId"
		FROM agent_runs r WHERE r.persona_id IS NULL AND r.runtime='native' AND r.closed_at IS NULL
		AND (r.ticket_id=${input.ticketId} OR (r.project_id=${input.projectId} AND r.kind='manager'))`,
	);
	const names = recipients.map((run) => run.personaName);
	const current = mentionedNames(input.body, names);
	const previous = mentionedNames(input.previousBody ?? "", names);
	for (const run of recipients) {
		const name = run.personaName.toLowerCase();
		if (!current.has(name) || previous.has(name)) continue;
		await tx.execute(sql`INSERT INTO comment_deliveries (id,comment_id,persona_id,run_id,persona_name,terminal_id,session_id)
			VALUES (${ulid()},${input.commentId},${run.personaId},${run.runId},${run.personaName},${run.terminalId},${run.sessionId})
			ON CONFLICT DO NOTHING`);
	}
};
