CREATE TABLE "agent_harness_observations" (
	"attempt_id" text PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"result_key" text,
	"attention_key" text,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_harness_observations" ADD CONSTRAINT "agent_harness_observations_attempt_id_agent_execution_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."agent_execution_attempts"("id") ON DELETE cascade ON UPDATE no action;