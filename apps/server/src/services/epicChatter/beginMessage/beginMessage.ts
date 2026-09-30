import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { fail, invalidInput } from "../../../errors.ts";
import type { ServiceCtx } from "../../support.ts";

type Endpoint = { id: string; name: string; epicId: string | null; projectId: string | null; enabled: boolean };
export type ChatterReceipt = { id: string; scopes: { id: string; projectId: string }[] };

export const beginMessage = async (
	ctx: Pick<ServiceCtx, "actor" | "now">,
	tx: Tx,
	input: { id: string; text: string; messageId: string },
): Promise<ChatterReceipt | null> => {
	if (ctx.actor.kind !== "agent") return null;
	const endpoints = await rows<Endpoint>(
		tx,
		sql`SELECT r.id, r.name, e.id AS "epicId", e.project_id AS "projectId",
		coalesce(c.enabled, true) AS enabled FROM agent_runs r
		LEFT JOIN tickets t ON t.id=r.ticket_id LEFT JOIN epics e ON e.id=t.epic_id
		LEFT JOIN epic_chatter_settings c ON c.epic_id=e.id
		WHERE r.id IN (${ctx.actor.name}, ${input.id})`,
	);
	if (endpoints.some((endpoint) => !endpoint.enabled))
		throw invalidInput("chatter", "Chatter is off for this epic. Agent messages to or from its agents are disabled.");
	const scopes = endpoints.flatMap((endpoint) =>
		endpoint.epicId ? [{ id: endpoint.epicId, projectId: endpoint.projectId! }] : [],
	);
	if (scopes.length === 0) return null;
	const sender = endpoints.find((endpoint) => endpoint.id === ctx.actor.name);
	const recipient = endpoints.find((endpoint) => endpoint.id === input.id);
	if (!recipient) throw fail("NOT_FOUND", { kind: "agent", ref: input.id });
	const key = createHash("sha256")
		.update(JSON.stringify([ctx.actor.name, input.id, input.messageId]))
		.digest("hex");
	const [existing] = await rows<{ id: string; text: string; senderId: string; recipientId: string; messageId: string }>(
		tx,
		sql`SELECT id, text, sender_id AS "senderId", recipient_id AS "recipientId", message_id AS "messageId"
		FROM chatter_messages WHERE delivery_key=${key}`,
	);
	if (existing) {
		if (
			existing.text !== input.text ||
			existing.senderId !== ctx.actor.name ||
			existing.recipientId !== input.id ||
			existing.messageId !== input.messageId
		)
			throw invalidInput("messageId", "This message identifier already names a different message.");
		return { id: existing.id, scopes };
	}
	const id = ulid();
	await tx.execute(sql`INSERT INTO chatter_messages
		(id, delivery_key, message_id, sender_id, sender_name, recipient_id, recipient_name, sender_epic_id, recipient_epic_id, text, created_at)
		VALUES (${id}, ${key}, ${input.messageId}, ${ctx.actor.name}, ${sender?.name ?? ctx.actor.name},
		${input.id}, ${recipient.name}, ${sender?.epicId ?? null}, ${recipient.epicId}, ${input.text}, ${ctx.now()})`);
	return { id, scopes };
};
