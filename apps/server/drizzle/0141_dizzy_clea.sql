CREATE TABLE "langflow_workspace_observations" (
	"step_id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_commit" text,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "langflow_workspace_commit" CHECK ("langflow_workspace_observations"."workspace_commit" ~ '^(?:[a-f0-9]{40}|[a-f0-9]{64})$')
);
--> statement-breakpoint
ALTER TABLE "langflow_execution_projections" ADD COLUMN "source_cursor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "langflow_execution_projections" ADD COLUMN "snapshot_bytes" text;--> statement-breakpoint
ALTER TABLE "langflow_execution_projections" ADD COLUMN "snapshot_digest" text;--> statement-breakpoint
ALTER TABLE "langflow_workspace_observations" ADD CONSTRAINT "langflow_workspace_observations_step_id_langflow_native_handles_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."langflow_native_handles"("step_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_workspace_observations" ADD CONSTRAINT "langflow_workspace_observations_execution_id_langflow_executions_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."langflow_executions"("execution_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_execution_projections" ADD CONSTRAINT "langflow_projection_source_cursor" CHECK ("langflow_execution_projections"."source_cursor" >= 0 AND "langflow_execution_projections"."source_cursor" <= 9007199254740991);--> statement-breakpoint
ALTER TABLE "langflow_execution_projections" ADD CONSTRAINT "langflow_projection_snapshot_bytes" CHECK (
		("langflow_execution_projections"."snapshot_bytes" IS NULL AND "langflow_execution_projections"."snapshot_digest" IS NULL AND "langflow_execution_projections"."source_cursor" = 0)
		OR ("langflow_execution_projections"."snapshot_bytes" IS NOT NULL AND "langflow_execution_projections"."snapshot_digest" IS NOT NULL
			AND "langflow_execution_projections"."snapshot_digest" = encode(sha256(convert_to("langflow_execution_projections"."snapshot_bytes", 'UTF8')), 'hex'))
	);