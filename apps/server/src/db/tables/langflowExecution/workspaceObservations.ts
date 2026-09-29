import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { langflowExecutions } from "./executions";
import { langflowNativeHandles } from "./native";

export const langflowWorkspaceObservations = pgTable(
	"langflow_workspace_observations",
	{
		stepId: text("step_id")
			.primaryKey()
			.references(() => langflowNativeHandles.stepId, { onDelete: "cascade" }),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		attemptId: text("attempt_id").notNull(),
		workspaceId: text("workspace_id").notNull(),
		workspaceCommit: text("workspace_commit"),
		observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
	},
	(t) => [check("langflow_workspace_commit", sql`${t.workspaceCommit} ~ '^(?:[a-f0-9]{40}|[a-f0-9]{64})$'`)],
);
