import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";

// A session is a scratch repository under `sessions/<name>` in the data
// home. It belongs to no project and no ticket. `run_id` names the agent run
// that owns its terminal; that run has the kind `session`. `harness` holds
// the launch configuration of the agent, because a session has no project
// to read one from. A delete removes the row and the directory. The run
// stays as history.
export const sessions = pgTable(
	"sessions",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		directory: text().notNull(),
		harness: jsonb().notNull(),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		// The name is the directory name: lowercase letters, digits, and
		// dashes, 1 to 40 characters, with no dash at either end.
		check("sessions_name_check", sql`${t.name} ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'`),
		unique("sessions_name_unique").on(t.name),
		unique("sessions_run_id_unique").on(t.runId),
	],
);
