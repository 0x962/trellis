import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentExecutionAttempts } from "./assignments.ts";

export const agentHarnessObservations = pgTable("agent_harness_observations", {
	attemptId: text("attempt_id")
		.primaryKey()
		.references(() => agentExecutionAttempts.id, { onDelete: "cascade" }),
	snapshot: jsonb().notNull(),
	checkpoint: jsonb(),
	resultKey: text("result_key"),
	attentionKey: text("attention_key"),
	updatedAt: at("updated_at").notNull(),
});
