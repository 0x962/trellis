ALTER TABLE "agent_sessions" DROP CONSTRAINT "agent_sessions_state_check";--> statement-breakpoint
DROP INDEX "agent_sessions_live_manager_idx";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "failure_exit_code" integer;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "failure_detail" text;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_live_manager_idx" ON "agent_sessions" USING btree ("project_id") WHERE "agent_sessions"."role" = 'manager' AND "agent_sessions"."state" NOT IN ('exited', 'stopped', 'failed');--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_pr_url_check" CHECK ("agent_sessions"."pr_url" IS NULL OR "agent_sessions"."role" = 'reviewer');--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_failure_reason_check" CHECK ("agent_sessions"."failure_reason" IN ('missing', 'disabled', 'unmapped', 'branch', 'error'));--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_failure_check" CHECK (("agent_sessions"."state" = 'failed') = ("agent_sessions"."failure_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_state_check" CHECK ("agent_sessions"."state" IN ('starting', 'running', 'waiting', 'exited', 'stopped', 'failed'));