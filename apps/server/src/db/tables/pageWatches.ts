import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { pages } from "./pages.ts";

// One agent can watch a Page. `cursor_at` and `cursor_id` identify the last
// comment that the agent accepted. `reservation_id` identifies one pending
// comment batch. `reservation_expires_at` sets the time when another read can
// take that batch. `reservation_end_at` and `reservation_end_id` fix the last
// comment in the batch when the batch starts. A retry after a crash therefore
// sends the same comments and excludes comments that arrived later.
// `last_completed_reservation_id` identifies the last accepted batch.
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
		reservationPayload: jsonb("reservation_payload").$type<{
			text: string;
			terminalId: string;
			sessionId: string | null;
		}>(),
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
