ALTER TABLE "agent_cursors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manager_controller_cursors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manager_dispatches" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manager_delegations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manager_next_actions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_cursors" CASCADE;--> statement-breakpoint
DROP TABLE "agent_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "manager_controller_cursors" CASCADE;--> statement-breakpoint
DROP TABLE "manager_dispatches" CASCADE;--> statement-breakpoint
DROP TABLE "manager_delegations" CASCADE;--> statement-breakpoint
DROP TABLE "manager_next_actions" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_runs" DROP CONSTRAINT "agent_runs_kind_check";--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_audience_check";--> statement-breakpoint
DROP INDEX "agent_runs_active_manager_idx";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "directory" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "projects" SET "directory" = COALESCE("manager_config"->>'directory', '');--> statement-breakpoint
DELETE FROM "agent_runs" WHERE "kind" = 'manager';--> statement-breakpoint
DELETE FROM "notes" WHERE "audience" = 'manager';--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "manager_config";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_kind_check" CHECK ("agent_runs"."kind" IN ('agent', 'flow', 'session'));--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_audience_check" CHECK ("notes"."audience" IN ('all', 'worker'));
