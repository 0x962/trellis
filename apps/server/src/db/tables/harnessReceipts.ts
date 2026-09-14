import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentExecutionAttempts } from "./assignments.ts";

export const agentHarnessReceipts = pgTable(
	"agent_harness_receipts",
	{
		attemptId: text("attempt_id")
			.notNull()
			.references(() => agentExecutionAttempts.id, { onDelete: "cascade" }),
		messageId: text("message_id").notNull(),
		observedAt: at("observed_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.attemptId, table.messageId] })],
);
