import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";

export const builderStartRequests = pgTable(
	"builder_start_requests",
	{
		id: text().primaryKey(),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		state: text().notNull().default("pending"),
		runId: text("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
		error: text(),
		retryAt: at("retry_at"),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		check(
			"builder_start_requests_state_check",
			sql`${t.state} IN ('pending','launching','assigned','canceled','failed')`,
		),
		uniqueIndex("builder_start_requests_pending_ticket_idx").on(t.ticketId).where(sql`${t.state}='pending'`),
	],
);
