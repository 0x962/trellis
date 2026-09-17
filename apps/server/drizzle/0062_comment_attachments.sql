ALTER TABLE "attachments" ADD COLUMN "comment_id" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_fk" FOREIGN KEY ("comment_id","ticket_id") REFERENCES "public"."comments"("id","ticket_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_comment_id_idx" ON "attachments" USING btree ("comment_id");