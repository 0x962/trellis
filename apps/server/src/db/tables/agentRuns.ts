import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { personas } from "./personas.ts";
import { projects } from "./projects.ts";
export const agentRuns = pgTable(
	"agent_runs",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		runtime: text().notNull().default("superset"),
		personaId: text("persona_id").references(() => personas.id, { onDelete: "set null" }),
		personaName: text("persona_name").notNull(),
		kind: text().notNull(),
		instruction: text().notNull(),
		projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
		projectPath: text("project_path").notNull(),
		ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
		ticketIdentifier: text("ticket_identifier"),
		state: text().notNull(),
		workspaceId: text("workspace_id"),
		terminalId: text("terminal_id"),
		url: text(),
		error: text(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("agent_runs_kind_check", sql`${t.kind} IN ('builder', 'reviewer', 'manager')`),
		check(
			"agent_runs_state_check",
			sql`${t.state} IN ('starting', 'interrupted', 'running', 'failed', 'stopped', 'exited')`,
		),
		// A ticket carries as many agents at once as the project concurrency
		// limit allows, which agentRuns.reserve counts before every insert.
		index("agent_runs_active_ticket_idx")
			.on(t.ticketId)
			.where(sql`${t.state} IN ('starting', 'interrupted', 'running')`),
		uniqueIndex("agent_runs_active_manager_idx")
			.on(t.projectId)
			.where(sql`${t.kind} = 'manager' AND ${t.state} IN ('starting', 'interrupted', 'running')`),
		index("agent_runs_created_at_idx").on(t.createdAt),
	],
);
