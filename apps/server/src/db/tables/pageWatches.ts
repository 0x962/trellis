import { sql } from "drizzle-orm";
import { check, index, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { pages } from "./pages.ts";

export const pageWatches = pgTable(
	"page_watches",
	{
		pageId: text("page_id")
			.primaryKey()
			.references(() => pages.id, { onDelete: "cascade" }),
		agentId: text("agent_id")
			.notNull()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		cursorAt: at("cursor_at"),
		cursorId: text("cursor_id"),
		reservationId: text("reservation_id"),
		reservationExpiresAt: at("reservation_expires_at"),
		reservationEndAt: at("reservation_end_at"),
		reservationEndId: text("reservation_end_id"),
		lastCompletedReservationId: text("last_completed_reservation_id"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("page_watches_cursor_check", sql`(${t.cursorAt} IS NULL) = (${t.cursorId} IS NULL)`),
		check(
			"page_watches_reservation_check",
			sql`(${t.reservationId} IS NULL) = (${t.reservationExpiresAt} IS NULL)
				AND (${t.reservationId} IS NULL) = (${t.reservationEndAt} IS NULL)
				AND (${t.reservationId} IS NULL) = (${t.reservationEndId} IS NULL)`,
		),
		index("page_watches_agent_id_idx").on(t.agentId),
		index("page_watches_reservation_expires_at_idx")
			.on(t.reservationExpiresAt)
			.where(sql`${t.reservationExpiresAt} IS NOT NULL`),
	],
);
