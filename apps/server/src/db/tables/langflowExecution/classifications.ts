import { jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { langflowExecutions } from "./executions";

export type ClassificationBinding = {
	executionId: string;
	publicationId: string;
	diffId: string;
	reviewedHead: string;
};
export type ClassificationResult =
	| { state: "succeeded"; relevance: { frontend: boolean; backend: boolean } }
	| { state: "failed"; error: string };
export type ClassificationReceipt = {
	receiptId: string;
	binding: ClassificationBinding;
	ownerToken: string;
	requestBytes: string;
	state: "claimed" | "succeeded" | "failed";
	relevance: { frontend: boolean; backend: boolean } | null;
	error: string | null;
};
export const langflowClassifications = pgTable(
	"langflow_classifications",
	{
		receiptId: text("receipt_id").primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		receipt: jsonb().$type<ClassificationReceipt>().notNull(),
	},
	(t) => [unique("langflow_classification_execution").on(t.executionId)],
);
