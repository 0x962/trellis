ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_recipient";--> statement-breakpoint
ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_one_source";--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "thread_message_id" text;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "due_at" timestamp (3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_thread_id_review_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."review_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_recipient" UNIQUE NULLS NOT DISTINCT("review_id","answer_comment_id","thread_message_id","run_id");--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_one_source" CHECK (num_nonnulls("review_deliveries"."review_id", "review_deliveries"."answer_comment_id", "review_deliveries"."thread_message_id") = 1);