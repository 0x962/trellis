-- Brings the agent manager back. The migration 0013_remove_agents dropped
-- the two agent tables and rewrote the seeded status descriptions, so a
-- database that ran it needs both again. A database that never ran 0013
-- still holds them, so every statement here is idempotent and ends in the
-- same state.
CREATE TABLE IF NOT EXISTS "agent_cursors" (
	"project_id" text PRIMARY KEY NOT NULL,
	"activity_id" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"ticket_id" text,
	"role" text NOT NULL,
	"runner" text NOT NULL,
	"state" text NOT NULL,
	"workspace_id" text,
	"terminal_id" text,
	"claude_session_id" text,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"open_url" text,
	"last_woken_at" timestamp (3) with time zone,
	"error" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "agent_sessions_role_check" CHECK ("agent_sessions"."role" IN ('manager', 'builder', 'reviewer')),
	CONSTRAINT "agent_sessions_runner_check" CHECK ("agent_sessions"."runner" IN ('superset')),
	CONSTRAINT "agent_sessions_state_check" CHECK ("agent_sessions"."state" IN ('starting', 'running', 'waiting', 'exited', 'stopped', 'failed')),
	CONSTRAINT "agent_sessions_name_check" CHECK (char_length("agent_sessions"."name") BETWEEN 1 AND 40),
	CONSTRAINT "agent_sessions_title_check" CHECK (char_length("agent_sessions"."title") BETWEEN 1 AND 120),
	CONSTRAINT "agent_sessions_ticket_check" CHECK (("agent_sessions"."role" = 'manager') = ("agent_sessions"."ticket_id" IS NULL))
);
--> statement-breakpoint
-- Postgres holds no ADD CONSTRAINT IF NOT EXISTS, so each foreign key drops
-- first. The drop of an absent constraint passes, and the add that follows
-- writes the one definition.
ALTER TABLE "agent_cursors" DROP CONSTRAINT IF EXISTS "agent_cursors_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "agent_cursors" ADD CONSTRAINT "agent_cursors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP CONSTRAINT IF EXISTS "agent_sessions_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP CONSTRAINT IF EXISTS "agent_sessions_ticket_id_tickets_id_fk";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_sessions_project_id_role_state_idx" ON "agent_sessions" USING btree ("project_id","role","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_sessions_ticket_id_idx" ON "agent_sessions" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_sessions_live_manager_idx" ON "agent_sessions" USING btree ("project_id") WHERE "agent_sessions"."role" = 'manager' AND "agent_sessions"."state" NOT IN ('exited', 'stopped', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_sessions_terminal_idx" ON "agent_sessions" USING btree ("workspace_id","terminal_id") WHERE "agent_sessions"."workspace_id" IS NOT NULL AND "agent_sessions"."terminal_id" IS NOT NULL;--> statement-breakpoint
-- The manager reads the description of a status as its rulebook, so each
-- seeded status takes its instruction back. The match names the exact text
-- that 0013 wrote, so a description a person edited stays as they wrote it,
-- and a database that never ran 0013 changes no row.
UPDATE "statuses" SET "description" = "seed"."description"
FROM (VALUES
	('Todo', 'todo', 'Work awaits its start. Clarify the requirements before work starts.', 'New work. Read it, ask in a comment when it is unclear, then start a builder.'),
	('In Progress', 'started', 'Work on this ticket is in progress.', 'A builder works on this ticket. Forward each new comment to the builder.'),
	('Agent Review', 'review', 'The pull request awaits an agent review.', 'A builder opened a PR. Run a reviewer.'),
	('Human Review', 'review', 'The pull request awaits a human review.', 'Waiting for the human reviewer. Do nothing unless they comment.'),
	('Done', 'done', 'The work is complete.', 'The work is complete. Close the builder''s workspace.'),
	('Canceled', 'canceled', 'Work on this ticket is canceled.', 'Nobody works on this ticket. Stop its builder and close its workspace.')
) AS "seed" ("name", "category", "previous_description", "description")
WHERE "statuses"."name" = "seed"."name"
	AND "statuses"."category" = "seed"."category"
	AND "statuses"."description" = "seed"."previous_description";
