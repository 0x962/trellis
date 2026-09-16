import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";

export const needsYouStates = pgTable(
	"needs_you_states",
	{
		actorName: text("actor_name").notNull(),
		itemId: text("item_id").notNull(),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		snoozedUntil: at("snoozed_until"),
		ignored: boolean().notNull().default(false),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.actorName, t.itemId] }),
		check("needs_you_states_action_check", sql`NOT (${t.ignored} AND ${t.snoozedUntil} IS NOT NULL)`),
	],
);
