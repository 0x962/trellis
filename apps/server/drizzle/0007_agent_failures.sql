ALTER TABLE "agent_sessions" DROP CONSTRAINT "agent_sessions_state_check";--> statement-breakpoint
DROP INDEX "agent_sessions_live_manager_idx";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "error" text;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_live_manager_idx" ON "agent_sessions" USING btree ("project_id") WHERE "agent_sessions"."role" = 'manager' AND "agent_sessions"."state" NOT IN ('exited', 'stopped', 'failed');--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_state_check" CHECK ("agent_sessions"."state" IN ('starting', 'running', 'waiting', 'exited', 'stopped', 'failed'));