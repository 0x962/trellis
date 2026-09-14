CREATE TABLE "agent_harness_receipts" (
	"attempt_id" text NOT NULL,
	"message_id" text NOT NULL,
	"observed_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "agent_harness_receipts_attempt_id_message_id_pk" PRIMARY KEY("attempt_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "agent_harness_observations" ADD COLUMN "checkpoint" jsonb;--> statement-breakpoint
ALTER TABLE "agent_harness_receipts" ADD CONSTRAINT "agent_harness_receipts_attempt_id_agent_execution_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."agent_execution_attempts"("id") ON DELETE cascade ON UPDATE no action;