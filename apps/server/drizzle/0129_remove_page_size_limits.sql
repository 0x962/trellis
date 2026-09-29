ALTER TABLE "page_assets" ADD CONSTRAINT "page_assets_size_check_expand" CHECK ("page_assets"."size" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "page_assets" DROP CONSTRAINT "page_assets_size_check";--> statement-breakpoint
ALTER TABLE "page_assets" RENAME CONSTRAINT "page_assets_size_check_expand" TO "page_assets_size_check";--> statement-breakpoint
ALTER TABLE "page_uploads" ADD CONSTRAINT "page_uploads_size_check_expand" CHECK ("page_uploads"."size" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "page_uploads" DROP CONSTRAINT "page_uploads_size_check";--> statement-breakpoint
ALTER TABLE "page_uploads" RENAME CONSTRAINT "page_uploads_size_check_expand" TO "page_uploads_size_check";--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_document_size_check_expand" CHECK ("page_versions"."document_size" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_document_size_check";--> statement-breakpoint
ALTER TABLE "page_versions" RENAME CONSTRAINT "page_versions_document_size_check_expand" TO "page_versions_document_size_check";--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_search_text_check";--> statement-breakpoint
UPDATE "page_versions" AS "version"
SET "search_indexed" = false
FROM "pages" AS "page"
WHERE "page"."id" = "version"."page_id"
	AND "page"."latest_version" = "version"."number"
	AND "version"."search_indexed" = true
	AND octet_length("version"."search_text") >= 1048573;
