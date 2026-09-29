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
	sourceCursor: bigint("source_cursor", { mode: "number" }).notNull().default(0),
	snapshotBytes: text("snapshot_bytes"),
	snapshotDigest: text("snapshot_digest"),
	revision: bigint({ mode: "number" }).notNull(),
	lastEventSeq: bigint("last_event_seq", { mode: "number" }).notNull(),
	firstAvailableSeq: bigint("first_available_seq", { mode: "number" }).notNull(),
}, (t) => [
	check("langflow_projection_source_cursor", sql`${t.sourceCursor} >= 0 AND ${t.sourceCursor} <= 9007199254740991`),
	check("langflow_projection_snapshot_bytes", sql`
		(${t.snapshotBytes} IS NULL AND ${t.snapshotDigest} IS NULL AND ${t.sourceCursor} = 0)
		OR (${t.snapshotBytes} IS NOT NULL AND ${t.snapshotDigest} IS NOT NULL
			AND ${t.snapshotDigest} = encode(sha256(convert_to(${t.snapshotBytes}, 'UTF8')), 'hex'))
	`),
]);
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
