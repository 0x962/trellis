import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { projects } from "./projects.ts";

// One chat room per root project, with named channels inside it. Every
// project of the tree shares the room of its root, so `project_id` is a
// root id. A channel is addressed by that root and its lower-case name, as
// on IRC, so it has no id of its own. Every room holds `ai` and `general`.
export const chatChannels = pgTable(
	"chat_channels",
	{
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		primaryKey({ name: "chat_channels_pkey", columns: [t.projectId, t.name] }),
		actorFk("chat_channels_actor_fk", t),
		check("chat_channels_name_check", sql`${t.name} ~ '^[a-z0-9][a-z0-9_-]{0,31}$'`),
	],
);

// The id is a ULID, so id order is time order and a reader resumes from the
// last id it saw.
export const chatMessages = pgTable(
	"chat_messages",
	{
		id: text().primaryKey(),
		projectId: text("project_id").notNull(),
		channel: text().notNull(),
		body: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		foreignKey({
			name: "chat_messages_channel_fk",
			columns: [t.projectId, t.channel],
			foreignColumns: [chatChannels.projectId, chatChannels.name],
		}).onDelete("cascade"),
		actorFk("chat_messages_actor_fk", t),
		check("chat_messages_body_check", sql`length(${t.body}) BETWEEN 1 AND 20000`),
		index("chat_messages_channel_id_idx").on(t.projectId, t.channel, t.id),
	],
);

// One row per message and receiving agent. `terminal_id` and `session_id`
// pin the attempt that was live at the write, so a replaced session never
// receives an old message. The states are the states of comment_deliveries.
export const chatDeliveries = pgTable(
	"chat_deliveries",
	{
		id: text().primaryKey(),
		messageId: text("message_id")
			.notNull()
			.references(() => chatMessages.id, { onDelete: "cascade" }),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		personaName: text("persona_name").notNull(),
		terminalId: text("terminal_id"),
		sessionId: text("session_id"),
		state: text().notNull().default("pending"),
		error: text(),
	},
	(t) => [
		unique("chat_deliveries_recipient").on(t.messageId, t.runId),
		index("chat_deliveries_state_idx").on(t.state),
		index("chat_deliveries_run_id_idx").on(t.runId),
	],
);
