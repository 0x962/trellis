ALTER TABLE "review_deliveries" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "author_kind" text;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "author_run_id" text;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_author_run_id_agent_runs_id_fk" FOREIGN KEY ("author_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Every comment that still waits takes the author of its message. The
-- first message of a thread holds the author on the thread, and a later
-- message holds it on the reply. Without this, a comment that an agent
-- wrote before the upgrade still reaches that agent.
UPDATE "review_deliveries" delivery
SET "author_name" = CASE WHEN delivery."thread_message_id" = thread."id" THEN thread."document" ->> 'author'
		ELSE (SELECT reply ->> 'author' FROM jsonb_array_elements(thread."document" -> 'replies') reply
			WHERE reply ->> 'id' = delivery."thread_message_id") END,
	"author_kind" = CASE WHEN delivery."thread_message_id" = thread."id" THEN thread."document" ->> 'kind'
		ELSE (SELECT reply ->> 'kind' FROM jsonb_array_elements(thread."document" -> 'replies') reply
			WHERE reply ->> 'id' = delivery."thread_message_id") END
FROM "review_threads" thread
WHERE delivery."thread_id" = thread."id" AND delivery."state" IN ('pending', 'held');--> statement-breakpoint
-- Trellis starts a native agent under the identifier of its run, so a row
-- of `agent_runs` with that identifier is the run that wrote the message.
UPDATE "review_deliveries" delivery SET "author_run_id" = run."id"
FROM "agent_runs" run
WHERE run."id" = delivery."author_name" AND delivery."author_kind" = 'agent';
