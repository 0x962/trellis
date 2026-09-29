import { bigint, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import type {
	NativeCompletionV1,
	NativeHandleV1,
	NativeLaunchProvenanceV1,
	NativeLaunchReceiptV1,
	CompletionReceiptV1,
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
		semanticKey: text("semantic_key").notNull(),
		occurrenceKey: text("occurrence_key").notNull(),
		requestId: text("request_id").notNull(),
		agentRunId: text("agent_run_id").notNull(),
		attemptId: text("attempt_id").notNull(),
		requestBytes: text("request_bytes").notNull(),
		requestDigest: text("request_digest").notNull(),
		provenance: jsonb().$type<NativeLaunchProvenanceV1>().notNull(),
		handle: jsonb().$type<NativeHandleV1>().notNull(),
		launchReceipt: jsonb("launch_receipt").$type<NativeLaunchReceiptV1>(),
	},
	(t) => [
		unique("langflow_native_semantic").on(t.executionId, t.semanticKey),
		unique("langflow_native_occurrence").on(t.executionId, t.occurrenceKey),
		unique("langflow_native_request").on(t.executionId, t.requestId),
		unique("langflow_native_task").on(t.executionId, t.taskKey),
		unique("langflow_native_attempt").on(t.attemptId),
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
