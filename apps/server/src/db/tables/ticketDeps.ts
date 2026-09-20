import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { checkIn, TICKET_DEP_SOURCES } from "../enums.ts";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";

// One row says that `ticket_id` waits for `depends_on_id`. The primary key
// keeps one source for each pair. A ticket delete removes each row that names
// it in either column.
export const ticketDeps = pgTable(
	"ticket_deps",
	{
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		dependsOnId: text("depends_on_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		source: text().notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		primaryKey({ name: "ticket_deps_pkey", columns: [t.ticketId, t.dependsOnId] }),
		check("ticket_deps_not_self", sql`${t.ticketId} <> ${t.dependsOnId}`),
		checkIn(t.source, TICKET_DEP_SOURCES),
		index("ticket_deps_depends_on_id_idx").on(t.dependsOnId),
	],
);
