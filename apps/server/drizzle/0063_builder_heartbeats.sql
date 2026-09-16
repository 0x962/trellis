CREATE TABLE "builder_heartbeats" (
	"run_id" text PRIMARY KEY NOT NULL,
	"sent_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builder_heartbeats" ADD CONSTRAINT "builder_heartbeats_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;