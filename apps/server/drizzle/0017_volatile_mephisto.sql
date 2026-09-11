CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"persona_id" text,
	"persona_name" text NOT NULL,
	"kind" text NOT NULL,
	"instruction" text NOT NULL,
	"project_id" text,
	"project_path" text NOT NULL,
	"ticket_id" text,
	"ticket_identifier" text,
	"state" text NOT NULL,
	"workspace_id" text,
	"terminal_id" text,
	"url" text,
	"error" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "agent_runs_kind_check" CHECK ("agent_runs"."kind" IN ('builder', 'reviewer', 'manager')),
	CONSTRAINT "agent_runs_state_check" CHECK ("agent_runs"."state" IN ('starting', 'interrupted', 'running', 'failed', 'stopped', 'exited'))
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_active_ticket_idx" ON "agent_runs" USING btree ("ticket_id") WHERE "agent_runs"."state" IN ('starting', 'interrupted', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_active_manager_idx" ON "agent_runs" USING btree ("project_id") WHERE "agent_runs"."kind" = 'manager' AND "agent_runs"."state" IN ('starting', 'interrupted', 'running');--> statement-breakpoint
CREATE INDEX "agent_runs_created_at_idx" ON "agent_runs" USING btree ("created_at");