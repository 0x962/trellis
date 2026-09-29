import type { FlowExecutionViewV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import type { EngineCheckpointV1, ExecutionEventV1 } from "../../../langflowContracts";
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
		sourceIdentityDigest: text("source_identity_digest").notNull(),
		sourceBytes: text("source_bytes").notNull(),
		event: jsonb().$type<ExecutionEventV1>().notNull(),
		seq: bigint({ mode: "number" }).notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.engineJobId, t.sourceIdentityDigest] }),
		unique("langflow_event_sequence").on(t.executionId, t.seq),
		check(
			"langflow_event_identity_digest",
			sql`${t.sourceIdentityDigest} = encode(sha256(convert_to(${t.sourceEventId}, 'UTF8')), 'hex')`,
		),
	],
);
