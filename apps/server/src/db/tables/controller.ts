import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
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
		workState: text("work_state").notNull().default("open"),
		outcomes: jsonb().notNull().default([]),
		nextActions: jsonb("next_actions").notNull().default([]),
		handledAt: at("handled_at"),
		events: jsonb().notNull(),
		dueAt: at("due_at").notNull(),
		error: text(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check(
			"manager_dispatches_state_check",
			sql`${t.state} IN ('pending', 'sending', 'sent', 'unknown', 'canceled', 'failed')`,
		),
		check("manager_dispatches_work_state_check", sql`${t.workState} IN ('untracked', 'open', 'handled')`),
		index("manager_dispatches_open_work_idx").on(t.projectId, t.createdAt).where(sql`${t.workState} = 'open'`),
		uniqueIndex("manager_dispatches_active_project_idx")
			.on(t.projectId)
			.where(sql`${t.state} IN ('pending', 'sending', 'unknown')`),
	],
);

// The last builder heartbeat per run. A heartbeat goes to a builder on an
// in-progress ticket whose session is idle, at most one per quiet window.
export const builderHeartbeats = pgTable("builder_heartbeats", {
	runId: text("run_id")
		.primaryKey()
		.references(() => agentRuns.id, { onDelete: "cascade" }),
	sentAt: at("sent_at").notNull(),
});
