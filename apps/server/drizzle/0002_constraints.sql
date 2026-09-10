ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_id_slug_unique" UNIQUE NULLS NOT DISTINCT ("parent_id", "slug");
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', "description"), 'B')) STORED;
--> statement-breakpoint
CREATE INDEX "tickets_search_idx" ON "tickets" USING gin ("search");
--> statement-breakpoint
CREATE INDEX "tickets_title_trgm_idx" ON "tickets" USING gin ("title" gin_trgm_ops);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', "body"), 'C')) STORED;
--> statement-breakpoint
CREATE INDEX "comments_search_idx" ON "comments" USING gin ("search");
