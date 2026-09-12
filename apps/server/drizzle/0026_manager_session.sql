ALTER TABLE "agent_runs" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "session_lost" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "agent_runs"
SET "state" = 'failed', "updated_at" = NOW()
WHERE "kind" = 'manager'
	AND "state" = 'interrupted'
	AND "workspace_id" IS NULL;
