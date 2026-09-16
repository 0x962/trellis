import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { projects } from "./projects.ts";

// One chat room per project, a root or a sub-project, with named channels
// inside it. A channel is addressed by its project and its lower-case name,
// as on IRC, so it has no id of its own. Every room holds `ai` and `general`.
export const chatChannels = pgTable(
	"chat_channels",
	{
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text().notNull(),
		// Only agents post in such a channel. `ai` is one.
		aiOnly: boolean("ai_only").notNull().default(false),
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
// `direct` marks a delivery the message addressed by a mention; the send of
// a direct delivery interrupts the agent's current turn.
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
		direct: boolean().notNull().default(false),
	},
	(t) => [
		unique("chat_deliveries_recipient").on(t.messageId, t.runId),
		index("chat_deliveries_state_idx").on(t.state),
		index("chat_deliveries_run_id_idx").on(t.runId),
	],
);

// A file posted in a room. The blob on disk is named by `sha256` and shared
// with ticket attachments of the same bytes; the boot sweep keeps every hash
// a row of either table names.
export const chatAttachments = pgTable(
	"chat_attachments",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		filename: text().notNull(),
		mime: text().notNull(),
		size: bigint({ mode: "number" }).notNull(),
		sha256: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		actorFk("chat_attachments_actor_fk", t),
		check(
			"chat_attachments_filename_check",
			sql`length(${t.filename}) BETWEEN 1 AND 255 AND position('/' IN ${t.filename}) = 0`,
		),
		check("chat_attachments_size_check", sql`${t.size} > 0`),
		check("chat_attachments_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
		index("chat_attachments_project_id_idx").on(t.projectId),
		index("chat_attachments_sha256_idx").on(t.sha256),
	],
);
