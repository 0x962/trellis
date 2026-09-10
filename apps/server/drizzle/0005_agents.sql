CREATE TABLE "agent_cursors" (
	"project_id" text PRIMARY KEY NOT NULL,
	"activity_id" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"ticket_id" text,
	"role" text NOT NULL,
	"runner" text NOT NULL,
	"state" text NOT NULL,
	"workspace_id" text,
	"terminal_id" text,
	"claude_session_id" text,
	"title" text NOT NULL,
	"open_url" text,
	"last_woken_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "agent_sessions_role_check" CHECK ("agent_sessions"."role" IN ('manager', 'builder', 'reviewer')),
	CONSTRAINT "agent_sessions_runner_check" CHECK ("agent_sessions"."runner" IN ('superset')),
	CONSTRAINT "agent_sessions_state_check" CHECK ("agent_sessions"."state" IN ('starting', 'running', 'waiting', 'exited', 'stopped')),
	CONSTRAINT "agent_sessions_title_check" CHECK (char_length("agent_sessions"."title") BETWEEN 1 AND 120),
	CONSTRAINT "agent_sessions_ticket_check" CHECK (("agent_sessions"."role" = 'manager') = ("agent_sessions"."ticket_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_cursors" ADD CONSTRAINT "agent_cursors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sessions_project_id_role_state_idx" ON "agent_sessions" USING btree ("project_id","role","state");--> statement-breakpoint
CREATE INDEX "agent_sessions_ticket_id_idx" ON "agent_sessions" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_live_manager_idx" ON "agent_sessions" USING btree ("project_id") WHERE "agent_sessions"."role" = 'manager' AND "agent_sessions"."state" NOT IN ('exited', 'stopped');--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_terminal_idx" ON "agent_sessions" USING btree ("workspace_id","terminal_id") WHERE "agent_sessions"."workspace_id" IS NOT NULL AND "agent_sessions"."terminal_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_description_check" CHECK (char_length("statuses"."description") <= 2000);