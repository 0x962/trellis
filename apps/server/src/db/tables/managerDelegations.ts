import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { projects } from "./projects.ts";

export const managerDelegations = pgTable(
	"manager_delegations",
	{
		runId: text("run_id")
			.primaryKey()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		parentRunId: text("parent_run_id")
			.notNull()
			.references(() => agentRuns.id),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		capacity: integer().notNull(),
		brief: text().notNull(),
		createdAt: at("created_at").notNull(),
		retiredAt: at("retired_at"),
	},
	(t) => [
		check("manager_delegations_capacity_check", sql`${t.capacity} BETWEEN 1 AND 64`),
		uniqueIndex("manager_delegations_project_idx").on(t.projectId).where(sql`${t.retiredAt} IS NULL`),
	],
);
