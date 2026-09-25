ALTER TABLE "agent_runs" ADD COLUMN "activity_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "agent_runs_updated_at_idx" ON "agent_runs" USING btree ("updated_at");