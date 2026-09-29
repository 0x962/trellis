CREATE TABLE "langflow_classifications" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"receipt" jsonb NOT NULL,
	CONSTRAINT "langflow_classification_execution" UNIQUE("execution_id")
);
--> statement-breakpoint
CREATE TABLE "langflow_deadlines" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"group_occurrence_key" text NOT NULL,
	"group_digest" text NOT NULL,
	"deadline" jsonb NOT NULL,
	CONSTRAINT "langflow_deadline_group" UNIQUE("execution_id","group_digest"),
	CONSTRAINT "langflow_deadline_digest" CHECK ("langflow_deadlines"."group_digest" = encode(sha256(convert_to("langflow_deadlines"."group_occurrence_key", 'UTF8')), 'hex'))
);
--> statement-breakpoint
CREATE TABLE "langflow_decisions" (
	"decision_id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"engine_job_id" text NOT NULL,
	"engine_request_id" text NOT NULL,
	"payload_bytes" text NOT NULL,
	"delivery" jsonb NOT NULL,
	CONSTRAINT "langflow_decision_wait" UNIQUE("engine_job_id","engine_request_id")
);
--> statement-breakpoint
CREATE TABLE "langflow_outbox" (
	"id" text NOT NULL,
	"execution_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload_bytes" text NOT NULL,
	"receipt" jsonb,
	CONSTRAINT "langflow_outbox_kind_id_pk" PRIMARY KEY("kind","id")
);
--> statement-breakpoint
CREATE TABLE "langflow_ownership_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"request_id" text NOT NULL,
	"request_bytes" text NOT NULL,
	"receipt" jsonb NOT NULL,
	CONSTRAINT "langflow_ownership_request" UNIQUE("execution_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "langflow_stops" (
	"obligation_id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"obligation" jsonb NOT NULL,
	CONSTRAINT "langflow_stop_attempt" UNIQUE("execution_id","attempt_id")
);
--> statement-breakpoint
CREATE TABLE "langflow_warnings" (
	"message_id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"deadline_id" text NOT NULL,
	"threshold" text NOT NULL,
	"payload_bytes" text NOT NULL,
	"acknowledged" jsonb,
	CONSTRAINT "langflow_warning_threshold" UNIQUE("execution_id","attempt_id","deadline_id","threshold")
);
--> statement-breakpoint
CREATE TABLE "langflow_executions" (
	"execution_id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"project_id" text NOT NULL,
	"diff_id" text,
	"reviewed_head" text,
	"repeat_of" text,
	"repeat_reason" text,
	"publication_id" text NOT NULL,
	"publication_record_id" text,
	"publication" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"host_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_name" text NOT NULL,
	"request_id" text NOT NULL,
	"request_bytes" text NOT NULL,
	"submission_bytes" text NOT NULL,
	"submission" jsonb NOT NULL,
	"engine_job_id" text,
	"engine_session_id" text,
	"correlation" jsonb,
	"admission" jsonb NOT NULL,
	"authority" jsonb,
	"cancel_intent" jsonb,
	"revision" bigint NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "langflow_start_actor_request" UNIQUE("actor_kind","actor_name","request_id"),
	CONSTRAINT "langflow_job_unique" UNIQUE("engine_job_id"),
	CONSTRAINT "langflow_session_unique" UNIQUE("engine_session_id")
);
--> statement-breakpoint
CREATE TABLE "langflow_start_receipts" (
	"actor_kind" text NOT NULL,
	"actor_name" text NOT NULL,
	"request_id" text NOT NULL,
	"request_bytes" text NOT NULL,
	"execution_id" text NOT NULL,
	"langflow_execution_id" text,
	"legacy_execution_id" text,
	CONSTRAINT "langflow_start_receipts_actor_kind_actor_name_request_id_pk" PRIMARY KEY("actor_kind","actor_name","request_id"),
	CONSTRAINT "langflow_start_receipt_target" CHECK ((("langflow_start_receipts"."langflow_execution_id" = "langflow_start_receipts"."execution_id" AND "langflow_start_receipts"."legacy_execution_id" IS NULL) OR ("langflow_start_receipts"."legacy_execution_id" = "langflow_start_receipts"."execution_id" AND "langflow_start_receipts"."langflow_execution_id" IS NULL)) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "langflow_completions" (
	"completion_id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"step_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"result_id" text NOT NULL,
	"result_version" bigint NOT NULL,
	"result_bytes" text NOT NULL,
	"result_digest" text NOT NULL,
	"completion" jsonb NOT NULL,
	"acceptance" jsonb,
	CONSTRAINT "langflow_completion_result" UNIQUE("attempt_id","result_id","result_version")
);
--> statement-breakpoint
CREATE TABLE "langflow_native_handles" (
	"step_id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"task_key" text NOT NULL,
	"task_digest" text NOT NULL,
	"semantic_key" text NOT NULL,
	"semantic_digest" text NOT NULL,
	"occurrence_key" text NOT NULL,
	"occurrence_digest" text NOT NULL,
	"request_id" text NOT NULL,
	"agent_run_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"request_bytes" text NOT NULL,
	"request_digest" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"handle" jsonb NOT NULL,
	"launch_receipt" jsonb,
	CONSTRAINT "langflow_native_semantic" UNIQUE("execution_id","semantic_digest"),
	CONSTRAINT "langflow_native_occurrence" UNIQUE("execution_id","occurrence_digest"),
	CONSTRAINT "langflow_native_request" UNIQUE("execution_id","request_id"),
	CONSTRAINT "langflow_native_task" UNIQUE("execution_id","task_digest"),
	CONSTRAINT "langflow_native_attempt" UNIQUE("attempt_id"),
	CONSTRAINT "langflow_native_task_digest" CHECK ("langflow_native_handles"."task_digest" = encode(sha256(convert_to("langflow_native_handles"."task_key", 'UTF8')), 'hex')),
	CONSTRAINT "langflow_native_semantic_digest" CHECK ("langflow_native_handles"."semantic_digest" = encode(sha256(convert_to("langflow_native_handles"."semantic_key", 'UTF8')), 'hex')),
	CONSTRAINT "langflow_native_occurrence_digest" CHECK ("langflow_native_handles"."occurrence_digest" = encode(sha256(convert_to("langflow_native_handles"."occurrence_key", 'UTF8')), 'hex'))
);
--> statement-breakpoint
CREATE TABLE "langflow_execution_projections" (
	"execution_id" text PRIMARY KEY NOT NULL,
	"view" jsonb NOT NULL,
	"checkpoint" jsonb,
	"revision" bigint NOT NULL,
	"last_event_seq" bigint NOT NULL,
	"first_available_seq" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "langflow_source_events" (
	"execution_id" text NOT NULL,
	"engine_job_id" text NOT NULL,
	"source_event_id" text NOT NULL,
	"source_identity_digest" text NOT NULL,
	"source_bytes" text NOT NULL,
	"event" jsonb NOT NULL,
	"seq" bigint NOT NULL,
	CONSTRAINT "langflow_source_events_engine_job_id_source_identity_digest_pk" PRIMARY KEY("engine_job_id","source_identity_digest"),
	CONSTRAINT "langflow_event_sequence" UNIQUE("execution_id","seq"),
	CONSTRAINT "langflow_event_identity_digest" CHECK ("langflow_source_events"."source_identity_digest" = encode(sha256(convert_to("langflow_source_events"."source_event_id", 'UTF8')), 'hex'))
);
--> statement-breakpoint
ALTER TABLE "langflow_classifications" ADD CONSTRAINT "langflow_classifications_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_deadlines" ADD CONSTRAINT "langflow_deadlines_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_decisions" ADD CONSTRAINT "langflow_decisions_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_outbox" ADD CONSTRAINT "langflow_outbox_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_ownership_receipts" ADD CONSTRAINT "langflow_ownership_receipts_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_stops" ADD CONSTRAINT "langflow_stops_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_warnings" ADD CONSTRAINT "langflow_warnings_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_executions" ADD CONSTRAINT "langflow_executions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_executions" ADD CONSTRAINT "langflow_executions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_executions" ADD CONSTRAINT "langflow_executions_diff_id_pull_requests_id_fk" FOREIGN KEY ("diff_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_executions" ADD CONSTRAINT "langflow_executions_publication_record_id_langflow_document_publications_publication_id_fk" FOREIGN KEY ("publication_record_id") REFERENCES "public"."langflow_document_publications"("publication_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_start_receipts" ADD CONSTRAINT "langflow_start_receipts_langflow_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("langflow_execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_start_receipts" ADD CONSTRAINT "langflow_start_receipts_legacy_execution_id_flow_executions_id_fk" FOREIGN KEY ("legacy_execution_id") REFERENCES "public"."flow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_completions" ADD CONSTRAINT "langflow_completions_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_completions" ADD CONSTRAINT "langflow_completions_step_id_langflow_native_handles_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."langflow_native_handles"("step_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_native_handles" ADD CONSTRAINT "langflow_native_handles_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_execution_projections" ADD CONSTRAINT "langflow_execution_projections_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_source_events" ADD CONSTRAINT "langflow_source_events_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "langflow_execution_ticket" ON "langflow_executions" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "langflow_execution_diff_flow" ON "langflow_executions" USING btree ("diff_id","flow_id","created_at");