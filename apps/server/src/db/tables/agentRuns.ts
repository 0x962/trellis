import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { harnessAccounts } from "./harnessAccounts.ts";
import { projects } from "./projects.ts";
export const agentRuns = pgTable(
	"agent_runs",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		accountId: text("account_id").references(() => harnessAccounts.id),
		runtime: text().notNull().default("native"),
		kind: text().notNull(),
		instruction: text().notNull(),
		projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
		projectPath: text("project_path").notNull(),
		ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
		ticketIdentifier: text("ticket_identifier"),
		closedAt: at("closed_at"),
		workspaceId: text("workspace_id"),
		terminalId: text("terminal_id"),
		url: text(),
		error: text(),
		// The agent session of the run, which trellis names before the first
		// start. A manager start after a pause hands it to the agent resume
		// command, in the workspace the row already names.
		sessionId: text("session_id"),
		// True while the last resume of a manager found no session.
		sessionLost: boolean("session_lost").notNull().default(false),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("agent_runs_kind_check", sql`${t.kind} IN ('agent', 'manager', 'flow', 'session')`),
		uniqueIndex("agent_runs_active_ticket_idx")
			.on(t.ticketId)
			.where(sql`${t.kind} = 'agent' AND ${t.closedAt} IS NULL`),
		uniqueIndex("agent_runs_active_manager_idx")
			.on(t.projectId)
			.where(sql`${t.kind} = 'manager' AND ${t.runtime} = 'native' AND ${t.closedAt} IS NULL`),
		index("agent_runs_created_at_idx").on(t.createdAt),
	],
);
