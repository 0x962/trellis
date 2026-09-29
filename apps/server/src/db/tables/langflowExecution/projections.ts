import type { FlowExecutionViewV1 } from "@trellis/api";
import { bigint, jsonb, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import type { ExecutionEventV1, EngineCheckpointV1 } from "../../../langflowContracts";
import { langflowExecutions } from "./executions";

export const langflowExecutionProjections = pgTable("langflow_execution_projections", {
	executionId: text("execution_id")
		.primaryKey()
		.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
	view: jsonb().$type<FlowExecutionViewV1>().notNull(),
	checkpoint: jsonb().$type<EngineCheckpointV1>(),
	revision: bigint({ mode: "number" }).notNull(),
	lastEventSeq: bigint("last_event_seq", { mode: "number" }).notNull(),
	firstAvailableSeq: bigint("first_available_seq", { mode: "number" }).notNull(),
});
export const langflowSourceEvents = pgTable(
	"langflow_source_events",
	{
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		engineJobId: text("engine_job_id").notNull(),
		sourceEventId: text("source_event_id").notNull(),
		sourceBytes: text("source_bytes").notNull(),
		event: jsonb().$type<ExecutionEventV1>().notNull(),
		seq: bigint({ mode: "number" }).notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.engineJobId, t.sourceEventId] }),
		unique("langflow_event_sequence").on(t.executionId, t.seq),
	],
);
