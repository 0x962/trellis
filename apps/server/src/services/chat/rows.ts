import type { ChatChannel, ChatMessage, ChatNotification, StoredActorKind } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

export type RawChannel = {
	project_id: string;
	name: string;
	ai_only: boolean;
	direct: boolean;
	message_count: number;
	latest_id: string | null;
	last_message_at: string | null;
	created_at: string;
};

export const channelSelect = sql`SELECT c.project_id, c.name, c.ai_only, c.direct,
	(SELECT count(*)::int FROM chat_messages m WHERE m.project_id = c.project_id AND m.channel = c.name) AS message_count,
	(SELECT max(m.id) FROM chat_messages m WHERE m.project_id = c.project_id AND m.channel = c.name) AS latest_id,
	(SELECT ${iso(sql`max(m.created_at)`)} FROM chat_messages m WHERE m.project_id = c.project_id AND m.channel = c.name) AS last_message_at,
	${iso(sql`c.created_at`)} AS created_at FROM chat_channels c`;

export const toChannel = (row: RawChannel): ChatChannel => ({
	projectId: row.project_id,
	name: row.name,
	aiOnly: row.ai_only,
	direct: row.direct,
	messageCount: row.message_count,
	latestId: row.latest_id,
	lastMessageAt: row.last_message_at,
	createdAt: row.created_at,
});

export type RawMessage = {
	id: string;
	project_id: string;
	channel: string;
	body: string;
	notifications: ChatNotification[];
	actor_name: string;
	actor_kind: StoredActorKind;
	actor_display_name: string | null;
	created_at: string;
};

const notifications = (id: SQL) => sql`COALESCE((SELECT jsonb_agg(jsonb_build_object(
	'runId',d.run_id,'personaName',d.persona_name,'state',d.state,'error',d.error,'direct',d.direct) ORDER BY d.id)
	FROM chat_deliveries d WHERE d.message_id=${id}), '[]'::jsonb)`;

// An agent actor is `agent:<run id>`, and the run names the persona, which
// is the name a reader knows the agent by.
export const messageSelect = sql`SELECT m.id, m.project_id, m.channel, m.body, ${notifications(sql`m.id`)} AS notifications,
	m.actor_name, m.actor_kind, r.persona_name AS actor_display_name, ${iso(sql`m.created_at`)} AS created_at
	FROM chat_messages m LEFT JOIN agent_runs r ON m.actor_kind = 'agent' AND r.id = m.actor_name`;

export const toMessage = (row: RawMessage): ChatMessage => ({
	id: row.id,
	projectId: row.project_id,
	channel: row.channel,
	body: row.body,
	...(row.notifications.length === 0 ? {} : { notifications: row.notifications }),
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	createdAt: row.created_at,
});

export const messageById = async (tx: Tx, id: string) => {
	const [row] = await rows<RawMessage>(tx, sql`${messageSelect} WHERE m.id = ${id}`);
	return toMessage(row!);
};
