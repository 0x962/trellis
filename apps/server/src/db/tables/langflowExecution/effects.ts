import { jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import type {
	GroupDeadlineV1,
	HumanDeliveryV1,
	RenewalReceiptV1,
	StopObligationV1,
	TakeoverReceiptV1,
} from "../../../langflowContracts";
import { langflowExecutions } from "./executions";

export const langflowDecisions = pgTable(
	"langflow_decisions",
	{
		decisionId: text("decision_id").primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		engineJobId: text("engine_job_id").notNull(),
		engineRequestId: text("engine_request_id").notNull(),
		payloadBytes: text("payload_bytes").notNull(),
		delivery: jsonb().$type<HumanDeliveryV1>().notNull(),
	},
	(t) => [unique("langflow_decision_wait").on(t.engineJobId, t.engineRequestId)],
);
export const langflowOutbox = pgTable("langflow_outbox", {
	id: text().primaryKey(),
	executionId: text("execution_id")
		.notNull()
		.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
	kind: text().$type<"admission" | "completion" | "decision">().notNull(),
	payloadBytes: text("payload_bytes").notNull(),
	receipt: jsonb().$type<Record<string, unknown>>(),
});
export const langflowOwnershipReceipts = pgTable(
	"langflow_ownership_receipts",
	{
		id: text().primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		requestId: text("request_id").notNull(),
		requestBytes: text("request_bytes").notNull(),
		receipt: jsonb().$type<TakeoverReceiptV1 | RenewalReceiptV1>().notNull(),
	},
	(t) => [unique("langflow_ownership_request").on(t.executionId, t.requestId)],
);
export const langflowStops = pgTable(
	"langflow_stops",
	{
		obligationId: text("obligation_id").primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		attemptId: text("attempt_id").notNull(),
		obligation: jsonb().$type<StopObligationV1>().notNull(),
	},
	(t) => [unique("langflow_stop_attempt").on(t.executionId, t.attemptId)],
);
export const langflowDeadlines = pgTable(
	"langflow_deadlines",
	{
		id: text().primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		groupOccurrenceKey: text("group_occurrence_key").notNull(),
		deadline: jsonb().$type<GroupDeadlineV1>().notNull(),
	},
	(t) => [unique("langflow_deadline_group").on(t.executionId, t.groupOccurrenceKey)],
);
