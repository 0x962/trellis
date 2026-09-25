import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";

// A session owns one agent run. `directory` is the workspace path for that
// run, and `run_id` names the run that owns its terminal. `harness` holds
// the launch configuration of the agent, because a session can have no
// project to read one from. A delete removes the row and the directory. The
// run stays as history.
//
// `archived_at` holds the time a person archived the session. A row with a
// time in this column runs no agent and holds no project.
export const sessions = pgTable(
	"sessions",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		titleState: text("title_state").notNull().default("set"),
		directory: text().notNull(),
		harness: jsonb().notNull(),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id),
		archivedAt: at("archived_at"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		// The name is what a person typed, with the spaces around it
		// removed, 1 to 60 characters. Two sessions may hold one name.
		check("sessions_name_check", sql`${t.name} = btrim(${t.name}) AND char_length(${t.name}) BETWEEN 1 AND 60`),
		check("sessions_title_state_check", sql`${t.titleState} IN ('temporary', 'requested', 'set')`),
		unique("sessions_run_id_unique").on(t.runId),
	],
);
