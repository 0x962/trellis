ALTER TABLE "review_deliveries" DROP CONSTRAINT "review_deliveries_recipient";--> statement-breakpoint
ALTER TABLE "review_deliveries" ALTER COLUMN "review_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD COLUMN "answer_comment_id" text;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_answer_comment_id_comments_id_fk" FOREIGN KEY ("answer_comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_recipient" UNIQUE NULLS NOT DISTINCT("review_id","answer_comment_id","run_id");--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_one_source" CHECK (num_nonnulls("review_deliveries"."review_id", "review_deliveries"."answer_comment_id") = 1);