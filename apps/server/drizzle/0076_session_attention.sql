ALTER TABLE "agent_runs" ADD COLUMN "seen_attempt_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "seen_sequence" integer DEFAULT 0 NOT NULL;