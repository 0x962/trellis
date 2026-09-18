import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { mentionedNames } from "./mentioned.ts";

type Recipient = { id: string; agentName: string; terminalId: string | null; sessionId: string | null };

export const enqueue = async (
	tx: Tx,
	input: {
		commentId: string;
		ticketId: string;
		body: string;
		previousBody?: string;
	},
) => {
	if (!input.body.includes("@")) return;
	const recipients = await rows<Recipient>(
		tx,
		sql`SELECT id, name AS "agentName", terminal_id AS "terminalId", session_id AS "sessionId"
		FROM agent_runs WHERE runtime='native' AND closed_at IS NULL
		AND ticket_id=${input.ticketId}`,
	);
	const names = recipients.map((run) => run.agentName);
	const current = mentionedNames(input.body, names);
	const previous = mentionedNames(input.previousBody ?? "", names);
	for (const run of recipients) {
		const name = run.agentName.toLowerCase();
		if (!current.has(name) || previous.has(name)) continue;
		await tx.execute(sql`INSERT INTO comment_deliveries (id,comment_id,run_id,agent_name,terminal_id,session_id)
			VALUES (${ulid()},${input.commentId},${run.id},${run.agentName},${run.terminalId},${run.sessionId})
			ON CONFLICT (comment_id,run_id) DO NOTHING`);
	}
};
