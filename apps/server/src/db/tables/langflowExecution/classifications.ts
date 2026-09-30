import { jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { langflowExecutions } from "./executions";

export const langflowClassifications = pgTable(
	"langflow_classifications",
	{
		receiptId: text("receipt_id").primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		receipt: jsonb().notNull(),
	},
	(t) => [unique("langflow_classification_execution").on(t.executionId)],
);
