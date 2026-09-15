import { sql } from "drizzle-orm";
import { bigint, check, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { projects } from "./projects.ts";

export const managerControllerCursors = pgTable("manager_controller_cursors", {
	projectId: text("project_id")
		.primaryKey()
		.references(() => projects.id, { onDelete: "cascade" }),
	activityId: bigint("activity_id", { mode: "number" }).notNull().default(0),
	generation: integer().notNull().default(0),
});

export const managerDispatches = pgTable(
	"manager_dispatches",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		runId: text("run_id"),
		terminalId: text("terminal_id"),
		sessionId: text("session_id"),
		generation: integer().notNull().default(0),
		state: text().notNull().default("pending"),
		events: jsonb().notNull(),
		dueAt: at("due_at").notNull(),
		error: text(),
		resolution: jsonb(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("manager_dispatches_state_check", sql`${t.state} IN ('pending', 'sending', 'sent', 'unknown', 'cancelled')`),
		check("manager_dispatches_cancellation_check", sql`${t.state} <> 'cancelled' OR ${t.resolution} IS NOT NULL`),
		uniqueIndex("manager_dispatches_active_project_idx")
			.on(t.projectId)
			.where(sql`${t.state} IN ('pending', 'sending', 'unknown')`),
	],
);
