ALTER TABLE "pages" DROP CONSTRAINT "pages_project_id_slug_unique";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_filename_check";--> statement-breakpoint
ALTER TABLE "page_assets" DROP CONSTRAINT "page_assets_mime_check";--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_summary_check";--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_title_check";--> statement-breakpoint
ALTER TABLE "page_uploads" DROP CONSTRAINT "page_uploads_mime_check";--> statement-breakpoint
ALTER TABLE "page_uploads" DROP CONSTRAINT "page_uploads_original_name_check";--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_label_check";--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_source_path_check";--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_slug_unique" EXCLUDE USING hash (("project_id" || '/' || "slug") WITH =);--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_filename_check" CHECK (length("attachments"."filename") >= 1 AND position('/' IN "attachments"."filename") = 0);--> statement-breakpoint
ALTER TABLE "page_assets" ADD CONSTRAINT "page_assets_mime_check" CHECK (length("page_assets"."mime") >= 1 AND "page_assets"."mime" !~ '[[:cntrl:]]');--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_title_check" CHECK ("pages"."title" = btrim("pages"."title") AND length("pages"."title") >= 1);--> statement-breakpoint
ALTER TABLE "page_uploads" ADD CONSTRAINT "page_uploads_mime_check" CHECK (length("page_uploads"."mime") >= 1 AND "page_uploads"."mime" !~ '[[:cntrl:]]');--> statement-breakpoint
ALTER TABLE "page_uploads" ADD CONSTRAINT "page_uploads_original_name_check" CHECK (length("page_uploads"."original_name") >= 1
				AND position('/' IN "page_uploads"."original_name") = 0
				AND position(E'\\' IN "page_uploads"."original_name") = 0
				AND "page_uploads"."original_name" !~ '[[:cntrl:]]');--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_label_check" CHECK ("page_versions"."label" IS NULL OR length("page_versions"."label") >= 1);--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_source_path_check" CHECK (length("page_versions"."source_path") >= 1
				AND left("page_versions"."source_path", 1) <> '/'
				AND "page_versions"."source_path" !~* '^[a-z]:/'
				AND position(E'\\' IN "page_versions"."source_path") = 0
				AND position('//' IN "page_versions"."source_path") = 0
				AND right("page_versions"."source_path", 1) <> '/'
				AND "page_versions"."source_path" !~ '(^|/)\.\.?(/|$)'
				AND "page_versions"."source_path" !~ '[[:cntrl:]]');
