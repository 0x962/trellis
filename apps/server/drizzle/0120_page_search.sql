ALTER TABLE "page_versions" ADD COLUMN "search_indexed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX "pages_title_search_idx" ON "pages" USING gin (to_tsvector('english', "title"));
--> statement-breakpoint
CREATE INDEX "pages_summary_search_idx" ON "pages" USING gin (to_tsvector('english', "summary"));
--> statement-breakpoint
CREATE INDEX "page_versions_search_text_idx" ON "page_versions" USING gin (to_tsvector('english', "search_text"));
