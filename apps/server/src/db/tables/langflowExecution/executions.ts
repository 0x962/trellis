import type { FlowDocumentSnapshotV1, FlowPublicationV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import type {
	AdmissionStateV1,
	CancelIntentV1,
	CorrelationReceiptV1,
	DeliveryAuthorityV1,
	SubmissionV1,
} from "../../../langflowContracts";
import { tickets } from "../../schema";
import { at } from "../actors";
import { flowExecutions } from "../flowExecutions";
import { langflowDocumentPublications } from "../langflowDocuments";
import { projects } from "../projects";
import { pullRequests } from "../pullRequests";

export const langflowExecutions = pgTable(
	"langflow_executions",
	{
		executionId: text("execution_id").primaryKey(),
		flowId: text("flow_id").notNull(),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		diffId: text("diff_id").references(() => pullRequests.id, { onDelete: "set null" }),
		reviewedHead: text("reviewed_head"),
		repeatOf: text("repeat_of"),
		repeatReason: text("repeat_reason"),
		publicationId: text("publication_id").notNull(),
		publicationRecordId: text("publication_record_id").references(() => langflowDocumentPublications.publicationId, {
			onDelete: "set null",
		}),
		publication: jsonb().$type<FlowPublicationV1>().notNull(),
		snapshot: jsonb().$type<FlowDocumentSnapshotV1>().notNull(),
		hostId: text("host_id").notNull(),
		actorKind: text("actor_kind").notNull(),
		actorName: text("actor_name").notNull(),
		requestId: text("request_id").notNull(),
		requestBytes: text("request_bytes").notNull(),
		submissionBytes: text("submission_bytes").notNull(),
		submission: jsonb().$type<SubmissionV1>().notNull(),
		engineJobId: text("engine_job_id"),
		engineSessionId: text("engine_session_id"),
		correlation: jsonb().$type<CorrelationReceiptV1>(),
		admission: jsonb().$type<AdmissionStateV1>().notNull(),
		authority: jsonb().$type<DeliveryAuthorityV1>(),
		cancelIntent: jsonb("cancel_intent").$type<CancelIntentV1>(),
		revision: bigint({ mode: "number" }).notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		index("langflow_start_actor_request_identity").using(
			"hash",
			sql`ARRAY[${t.actorKind}, ${t.actorName}, ${t.requestId}]`,
		),
		unique("langflow_job_unique").on(t.engineJobId),
		unique("langflow_session_unique").on(t.engineSessionId),
		index("langflow_execution_ticket").on(t.ticketId),
		index("langflow_execution_diff_flow").on(t.diffId, t.flowId, t.createdAt),
	],
);

export const langflowStartReceipts = pgTable(
	"langflow_start_receipts",
	{
		actorKind: text("actor_kind").notNull(),
		actorName: text("actor_name").notNull(),
		requestId: text("request_id").notNull(),
		requestBytes: text("request_bytes").notNull(),
		executionId: text("execution_id").notNull(),
		langflowExecutionId: text("langflow_execution_id").references(() => langflowExecutions.executionId, {
			onDelete: "cascade",
		}),
		legacyExecutionId: text("legacy_execution_id").references(() => flowExecutions.id, { onDelete: "cascade" }),
	},
	(t) => [
		index("langflow_start_receipts_identity").using("hash", sql`ARRAY[${t.actorKind}, ${t.actorName}, ${t.requestId}]`),
		check(
			"langflow_start_receipt_target",
			sql`((${t.langflowExecutionId} = ${t.executionId} AND ${t.legacyExecutionId} IS NULL) OR (${t.legacyExecutionId} = ${t.executionId} AND ${t.langflowExecutionId} IS NULL)) IS TRUE`,
		),
	],
);
