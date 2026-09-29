import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import type {
	CompletionReceiptV1,
	NativeCompletionV1,
	NativeHandleV1,
	NativeLaunchProvenanceV1,
	NativeLaunchReceiptV1,
} from "../../../langflowContracts";
import { langflowExecutions } from "./executions";

export const langflowNativeHandles = pgTable(
	"langflow_native_handles",
	{
		stepId: text("step_id").primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		taskKey: text("task_key").notNull(),
		taskDigest: text("task_digest").notNull(),
		semanticKey: text("semantic_key").notNull(),
		semanticDigest: text("semantic_digest").notNull(),
		occurrenceKey: text("occurrence_key").notNull(),
		occurrenceDigest: text("occurrence_digest").notNull(),
		requestId: text("request_id").notNull(),
		agentRunId: text("agent_run_id").notNull(),
		attemptId: text("attempt_id").notNull(),
		requestBytes: text("request_bytes").notNull(),
		requestDigest: text("request_digest").notNull(),
		launchSnapshotDigest: text("launch_snapshot_digest"),
		provenance: jsonb().$type<NativeLaunchProvenanceV1>().notNull(),
		handle: jsonb().$type<NativeHandleV1>().notNull(),
		launchReceipt: jsonb("launch_receipt").$type<NativeLaunchReceiptV1>(),
	},
	(t) => [
		check("langflow_native_snapshot_digest", sql`${t.launchSnapshotDigest} ~ '^[0-9a-f]{64}$'`),
		unique("langflow_native_semantic").on(t.executionId, t.semanticDigest),
		unique("langflow_native_occurrence").on(t.executionId, t.occurrenceDigest),
		unique("langflow_native_request").on(t.executionId, t.requestId),
		unique("langflow_native_task").on(t.executionId, t.taskDigest),
		unique("langflow_native_attempt").on(t.attemptId),
		check(
			"langflow_native_task_digest",
			sql`${t.taskDigest} = encode(sha256(convert_to(${t.taskKey}, 'UTF8')), 'hex')`,
		),
		check(
			"langflow_native_semantic_digest",
			sql`${t.semanticDigest} = encode(sha256(convert_to(${t.semanticKey}, 'UTF8')), 'hex')`,
		),
		check(
			"langflow_native_occurrence_digest",
			sql`${t.occurrenceDigest} = encode(sha256(convert_to(${t.occurrenceKey}, 'UTF8')), 'hex')`,
		),
	],
);

export const langflowCompletions = pgTable(
	"langflow_completions",
	{
		completionId: text("completion_id").primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => langflowExecutions.executionId, { onDelete: "cascade" }),
		stepId: text("step_id")
			.notNull()
			.references(() => langflowNativeHandles.stepId, { onDelete: "cascade" }),
		attemptId: text("attempt_id").notNull(),
		resultId: text("result_id").notNull(),
		resultVersion: bigint("result_version", { mode: "number" }).notNull(),
		resultBytes: text("result_bytes").notNull(),
		resultDigest: text("result_digest").notNull(),
		completion: jsonb().$type<NativeCompletionV1>().notNull(),
		acceptance: jsonb().$type<CompletionReceiptV1>(),
	},
	(t) => [unique("langflow_completion_result").on(t.attemptId, t.resultId, t.resultVersion)],
);
