import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { harnessAccounts } from "./harnessAccounts.ts";
import { projects } from "./projects.ts";
export const agentRuns = pgTable(
	"agent_runs",
	{
		id: text().primaryKey(),
		seenAttemptId: text("seen_attempt_id"),
		seenSequence: integer("seen_sequence").notNull().default(0),
		name: text().notNull(),
		accountId: text("account_id").references(() => harnessAccounts.id),
		runtime: text().notNull().default("native"),
		harness: jsonb(),
		kind: text().notNull(),
		instruction: text().notNull(),
		projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
		projectKey: text("project_key").notNull(),
		ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
		ticketIdentifier: text("ticket_identifier"),
		pinnedAt: at("pinned_at"),
		closedAt: at("closed_at"),
		// The moment the harness process of the first launch started. A resume
		// and a retry leave it as it is. The difference to `created_at` is the
		// time a person waits from the start request to a running agent.
		launchedAt: at("launched_at"),
		workspaceId: text("workspace_id"),
		terminalId: text("terminal_id"),
		url: text(),
		error: text(),
		// The agent session of the run, which trellis names before the first start.
		sessionId: text("session_id"),
		// True while the last resume found no session.
		sessionLost: boolean("session_lost").notNull().default(false),
		activityAt: at("activity_at"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("agent_runs_kind_check", sql`${t.kind} IN ('agent', 'flow', 'session')`),
		uniqueIndex("agent_runs_active_ticket_idx")
			.on(t.ticketId)
			.where(sql`${t.kind} = 'agent' AND ${t.closedAt} IS NULL`),
		index("agent_runs_pinned_at_idx").on(t.pinnedAt).where(sql`${t.pinnedAt} IS NOT NULL`),
		index("agent_runs_created_at_idx").on(t.createdAt),
		index("agent_runs_updated_at_idx").on(t.updatedAt),
	],
);
