ALTER TABLE "page_assets" DROP CONSTRAINT "page_assets_size_check";--> statement-breakpoint
ALTER TABLE "page_uploads" DROP CONSTRAINT "page_uploads_size_check";--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_document_size_check";--> statement-breakpoint
ALTER TABLE "page_assets" ADD CONSTRAINT "page_assets_size_check" CHECK ("page_assets"."size" >= 0);--> statement-breakpoint
ALTER TABLE "page_uploads" ADD CONSTRAINT "page_uploads_size_check" CHECK ("page_uploads"."size" >= 0);--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_document_size_check" CHECK ("page_versions"."document_size" > 0);