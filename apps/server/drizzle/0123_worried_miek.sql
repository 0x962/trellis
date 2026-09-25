ALTER TABLE "agent_runs" ADD COLUMN "activity_at" timestamp (3) with time zone;--> statement-breakpoint
UPDATE "agent_runs" SET "activity_at" = GREATEST(
	"updated_at",
	"closed_at",
	(SELECT MAX("created_at") FROM "agent_execution_attempts" WHERE "run_id" = "agent_runs"."id")
);--> statement-breakpoint
CREATE INDEX "agent_runs_updated_at_idx" ON "agent_runs" USING btree ("updated_at");
