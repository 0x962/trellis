import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { projects } from "./projects.ts";

export const managerNextActions = pgTable(
	"manager_next_actions",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		statusId: text("status_id").notNull(),
		assignmentRequestId: text("assignment_request_id").notNull().unique(),
		reason: text().notNull(),
		state: text().notNull().default("waiting"),
		runId: text("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
		createdAt: at("created_at").notNull(),
		eligibleAt: at("eligible_at"),
		notifiedAt: at("notified_at"),
		assignedAt: at("assigned_at"),
	},
	(t) => [
		check("manager_next_actions_state_check", sql`${t.state} IN ('waiting','assigned','canceled')`),
		uniqueIndex("manager_next_actions_waiting_ticket_idx").on(t.projectId, t.ticketId).where(sql`${t.state}='waiting'`),
	],
);
