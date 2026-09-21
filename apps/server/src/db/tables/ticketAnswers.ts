import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { actorColumns, actorFk, at } from "./actors.ts";

// One row is one answer to a question ticket: the option number the actor
// picked and the reason they gave. `apps/server/src/services/tickets/answer.ts`
// writes it in the same transaction that moves the question to done. A
// question that was reopened and answered again holds one row per answer,
// and a reader takes the newest by (created_at, id).
export const ticketAnswers = pgTable(
	"ticket_answers",
	{
		id: text().primaryKey(),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		option: integer().notNull(),
		reason: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		actorFk("ticket_answers_actor_fk", t),
		check("ticket_answers_option_check", sql`${t.option} BETWEEN 1 AND 99`),
		index("ticket_answers_ticket_id_created_at_idx").on(t.ticketId, t.createdAt),
	],
);
