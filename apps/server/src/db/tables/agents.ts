import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { AGENT_ROLES, AGENT_RUNNERS, AGENT_STATES, checkIn, RUNNER_REASONS } from "../enums.ts";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { projects } from "./projects.ts";

// One row per agent that the runner started or that reported itself. A
// manager serves a whole project and names no ticket; a builder and a
// reviewer name the one ticket they work. The runner ids are opaque text
// that trellis stores and gives back to the runner unchanged.
// `claude_session_id` is what the runner resumes an exited agent from.
// `pr_url` is the pull request a reviewer reads; the other two roles have
// none. A row in the `failed` state holds why the runner refused the start:
// `failure_reason` is the closed reason, `failure_exit_code` is what the
// runner process returned, and `failure_detail` is the whole text the
// runner printed on stderr.
export const agentSessions = pgTable(
	"agent_sessions",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
		role: text().notNull(),
		runner: text().notNull(),
		state: text().notNull(),
		workspaceId: text("workspace_id"),
		terminalId: text("terminal_id"),
		claudeSessionId: text("claude_session_id"),
		title: text().notNull(),
		openUrl: text("open_url"),
		prUrl: text("pr_url"),
		failureReason: text("failure_reason"),
		failureExitCode: integer("failure_exit_code"),
		failureDetail: text("failure_detail"),
		lastWokenAt: at("last_woken_at"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		checkIn(t.role, AGENT_ROLES),
		checkIn(t.runner, AGENT_RUNNERS),
		checkIn(t.state, AGENT_STATES),
		check("agent_sessions_title_check", sql`char_length(${t.title}) BETWEEN 1 AND 120`),
		check("agent_sessions_ticket_check", sql`(${t.role} = 'manager') = (${t.ticketId} IS NULL)`),
		check("agent_sessions_pr_url_check", sql`${t.prUrl} IS NULL OR ${t.role} = 'reviewer'`),
		checkIn(t.failureReason, RUNNER_REASONS),
		check("agent_sessions_failure_check", sql`(${t.state} = 'failed') = (${t.failureReason} IS NOT NULL)`),
		index("agent_sessions_project_id_role_state_idx").on(t.projectId, t.role, t.state),
		index("agent_sessions_ticket_id_idx").on(t.ticketId),
		// A project has one live manager. A manager that exited, that trellis
		// stopped, or whose start the runner refused stays as history, so it
		// is outside the index.
		uniqueIndex("agent_sessions_live_manager_idx")
			.on(t.projectId)
			.where(sql`${t.role} = 'manager' AND ${t.state} NOT IN ('exited', 'stopped', 'failed')`),
		// agents.register finds the row of a running agent by its terminal.
		uniqueIndex("agent_sessions_terminal_idx")
			.on(t.workspaceId, t.terminalId)
			.where(sql`${t.workspaceId} IS NOT NULL AND ${t.terminalId} IS NOT NULL`),
	],
);

// `activity_id` is the id of the last activity row the project's manager
// read through agents.inbox. The inbox moves it in the transaction that
// reads the rows after it.
export const agentCursors = pgTable("agent_cursors", {
	projectId: text("project_id")
		.primaryKey()
		.references(() => projects.id, { onDelete: "cascade" }),
	activityId: bigint("activity_id", { mode: "number" }).notNull().default(0),
	updatedAt: at("updated_at").notNull(),
});
