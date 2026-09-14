import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { agentExecutionAttempts } from "./assignments.ts";
import { flowExecutions } from "./flowExecutions.ts";
export const flowExecutionTasks = pgTable(
	"flow_execution_tasks",
	{
		executionId: text("execution_id")
			.notNull()
			.references(() => flowExecutions.id, { onDelete: "cascade" }),
		key: text().notNull(),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		attemptId: text("attempt_id")
			.notNull()
			.references(() => agentExecutionAttempts.id, { onDelete: "cascade" }),
		resultId: text("result_id"),
		createdAt: at("created_at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.executionId, t.key] })],
);
