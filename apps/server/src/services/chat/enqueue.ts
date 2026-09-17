import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { type Recipient, recipientsOf } from "./recipients.ts";

// `toManager` is the direct message channel: the live manager of the
// project is the one recipient, and the delivery interrupts it. A post in
// #general that mentions nobody reaches the live managers only, so the
// workers read the room when they want and not on every human remark. A
// post in any other channel with no mention reaches every live agent.
export const enqueue = async (
	tx: Tx,
	input: { messageId: string; rootId: string; channel: string; body: string; actor: ActorRef; toManager: boolean },
) => {
	const live = await rows<Recipient>(
		tx,
		sql`SELECT r.id, r.persona_name AS "personaName", r.kind, r.terminal_id AS "terminalId", r.session_id AS "sessionId"
		FROM agent_runs r WHERE r.runtime = 'native' AND r.closed_at IS NULL AND r.project_id = ${input.rootId}`,
	);
	const everyone = recipientsOf(live, input.body, input.actor);
	const mentioned = everyone.some((entry) => entry.direct);
	const addressed = input.toManager
		? live
				.filter((run) => run.kind === "manager" && !(input.actor.kind === "agent" && input.actor.name === run.id))
				.map((run) => ({ run, direct: true }))
		: input.channel === "general" && !mentioned
			? everyone.filter((entry) => entry.run.kind === "manager")
			: everyone;
	for (const { run, direct } of addressed) {
		await tx.execute(sql`INSERT INTO chat_deliveries (id, message_id, run_id, persona_name, terminal_id, session_id, direct)
			VALUES (${ulid()}, ${input.messageId}, ${run.id}, ${run.personaName}, ${run.terminalId}, ${run.sessionId}, ${direct})
			ON CONFLICT (message_id, run_id) DO NOTHING`);
	}
};
