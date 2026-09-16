CREATE TABLE "manager_next_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"status_id" text NOT NULL,
	"assignment_request_id" text NOT NULL,
	"reason" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"run_id" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"eligible_at" timestamp (3) with time zone,
	"notified_at" timestamp (3) with time zone,
	"assigned_at" timestamp (3) with time zone,
	CONSTRAINT "manager_next_actions_assignment_request_id_unique" UNIQUE("assignment_request_id"),
	CONSTRAINT "manager_next_actions_state_check" CHECK ("manager_next_actions"."state" IN ('waiting','assigned','canceled'))
);
--> statement-breakpoint
ALTER TABLE "manager_dispatches" ADD COLUMN "next_actions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "manager_next_actions" ADD CONSTRAINT "manager_next_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_next_actions" ADD CONSTRAINT "manager_next_actions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_next_actions" ADD CONSTRAINT "manager_next_actions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manager_next_actions_waiting_ticket_idx" ON "manager_next_actions" USING btree ("project_id","ticket_id") WHERE "manager_next_actions"."state"='waiting';