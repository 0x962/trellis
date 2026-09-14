CREATE TABLE "flow_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"project_id" text NOT NULL,
	"default_persona_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_name" text NOT NULL,
	"request_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"doc" jsonb NOT NULL,
	"personas" jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "flow_executions_actor_request_unique" UNIQUE("actor_kind","actor_name","request_id")
);
--> statement-breakpoint
CREATE TABLE "flow_execution_tasks" (
	"execution_id" text NOT NULL,
	"key" text NOT NULL,
	"run_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"result_id" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "flow_execution_tasks_execution_id_key_pk" PRIMARY KEY("execution_id","key")
);
--> statement-breakpoint
ALTER TABLE "flow_executions" ADD CONSTRAINT "flow_executions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_executions" ADD CONSTRAINT "flow_executions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_tasks" ADD CONSTRAINT "flow_execution_tasks_execution_id_flow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."flow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_tasks" ADD CONSTRAINT "flow_execution_tasks_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_execution_tasks" ADD CONSTRAINT "flow_execution_tasks_attempt_id_agent_execution_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."agent_execution_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_executions_ticket_idx" ON "flow_executions" USING btree ("ticket_id");