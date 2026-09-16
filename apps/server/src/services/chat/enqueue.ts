import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { type Recipient, recipientsOf } from "./recipients.ts";

export const enqueue = async (tx: Tx, input: { messageId: string; rootId: string; body: string; actor: ActorRef }) => {
	const live = await rows<Recipient>(
		tx,
		sql`SELECT r.id, r.persona_name AS "personaName", r.terminal_id AS "terminalId", r.session_id AS "sessionId"
		FROM agent_runs r JOIN projects p ON p.id = r.project_id
		WHERE r.runtime = 'native' AND r.closed_at IS NULL AND p.root_id = ${input.rootId}`,
	);
	for (const run of recipientsOf(live, input.body, input.actor)) {
		await tx.execute(sql`INSERT INTO chat_deliveries (id, message_id, run_id, persona_name, terminal_id, session_id)
			VALUES (${ulid()}, ${input.messageId}, ${run.id}, ${run.personaName}, ${run.terminalId}, ${run.sessionId})
			ON CONFLICT (message_id, run_id) DO NOTHING`);
	}
};
