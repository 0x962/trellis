CREATE TABLE "ticket_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"option" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "ticket_answers_option_check" CHECK ("ticket_answers"."option" BETWEEN 1 AND 99)
);
--> statement-breakpoint
ALTER TABLE "ticket_answers" ADD CONSTRAINT "ticket_answers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_answers" ADD CONSTRAINT "ticket_answers_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_answers_ticket_id_created_at_idx" ON "ticket_answers" USING btree ("ticket_id","created_at");--> statement-breakpoint
-- Each answer that a question ticket holds as a comment becomes a row with the
-- same id, so a queued delivery keeps its message. An answer comment reads
-- "Answer: option <n>. <reason>". A comment counts when a delivery points at
-- it, or when a person wrote it on a ticket whose description lists options.
INSERT INTO "ticket_answers" ("id", "ticket_id", "option", "reason", "actor_name", "actor_kind", "created_at")
SELECT c.id, c.ticket_id,
	(regexp_match(c.body, '^Answer: option ([1-9][0-9]?)\.'))[1]::int,
	btrim(regexp_replace(c.body, '^Answer: option [1-9][0-9]?\.', '')),
	c.actor_name, c.actor_kind, c.created_at
FROM "comments" c JOIN "tickets" t ON t.id = c.ticket_id
WHERE c.body ~ '^Answer: option ([1-9][0-9]?)\.'
	AND (
		c.id IN (SELECT "answer_comment_id" FROM "review_deliveries" WHERE "answer_comment_id" IS NOT NULL)
		OR (c.actor_kind = 'human' AND t.description ~ '(^|\n)[[:blank:]]*Options:[[:space:]]*[0-9]+[.)][[:blank:]]+[^[:space:]]')
	);--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_recipient";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_one_source";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_answer_comment_id_comments_id_fk";--> statement-breakpoint
ALTER TABLE "review_deliveries" RENAME COLUMN "answer_comment_id" TO "answer_id";--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_answer_id_ticket_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."ticket_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_recipient" UNIQUE NULLS NOT DISTINCT("review_id","answer_id","run_id");--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_one_source" CHECK (num_nonnulls("review_deliveries"."review_id", "review_deliveries"."answer_id") = 1);
