ALTER TABLE "comments" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "resolved_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_id_ticket_id_unique" UNIQUE("id","ticket_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_fk" FOREIGN KEY ("parent_id","ticket_id") REFERENCES "public"."comments"("id","ticket_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_parent_id_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_check" CHECK ("comments"."parent_id" <> "comments"."id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_resolved_root_check" CHECK ("comments"."parent_id" IS NULL OR "comments"."resolved_at" IS NULL);
