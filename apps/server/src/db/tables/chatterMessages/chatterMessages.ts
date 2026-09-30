import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { at } from "../actors.ts";
import { epics } from "../epics.ts";

export const chatterMessages = pgTable(
	"chatter_messages",
	{
		id: text().primaryKey(),
		deliveryKey: text("delivery_key").notNull(),
		messageId: text("message_id").notNull(),
		senderId: text("sender_id").notNull(),
		senderName: text("sender_name").notNull(),
		recipientId: text("recipient_id").notNull(),
		recipientName: text("recipient_name").notNull(),
		senderEpicId: text("sender_epic_id").references(() => epics.id, { onDelete: "set null" }),
		recipientEpicId: text("recipient_epic_id").references(() => epics.id, { onDelete: "set null" }),
		text: text().notNull(),
		state: text().notNull().default("pending"),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		uniqueIndex("chatter_messages_delivery_idx").on(t.deliveryKey),
		index("chatter_messages_sender_epic_idx").on(t.senderEpicId, t.id),
		index("chatter_messages_recipient_epic_idx").on(t.recipientEpicId, t.id),
		check("chatter_messages_state_check", sql`${t.state} IN ('pending', 'sent', 'queued', 'skipped', 'unconfirmed')`),
	],
);
