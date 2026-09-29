ALTER TABLE "epics" DROP CONSTRAINT "epics_project_id_slug_unique";--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_project_id_slug_unique";--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_project_id_name_unique";--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_project_id_slug_unique";--> statement-breakpoint
ALTER TABLE "waves" DROP CONSTRAINT "waves_epic_id_slug_unique";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_filename_check";--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_title_check";--> statement-breakpoint
ALTER TABLE "actors" DROP CONSTRAINT "actors_name_check";--> statement-breakpoint
ALTER TABLE "epic_resources" DROP CONSTRAINT "epic_resources_body_check";--> statement-breakpoint
ALTER TABLE "epic_resources" DROP CONSTRAINT "epic_resources_name_check";--> statement-breakpoint
ALTER TABLE "epic_resources" DROP CONSTRAINT "epic_resources_url_check";--> statement-breakpoint
ALTER TABLE "epics" DROP CONSTRAINT "epics_description_check";--> statement-breakpoint
ALTER TABLE "epics" DROP CONSTRAINT "epics_name_check";--> statement-breakpoint
ALTER TABLE "label_groups" DROP CONSTRAINT "label_groups_name_check";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_description_check";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_name_check";--> statement-breakpoint
ALTER TABLE "page_assets" DROP CONSTRAINT "page_assets_mime_check";--> statement-breakpoint
ALTER TABLE "page_comment_threads" DROP CONSTRAINT "page_comment_threads_anchor_check";--> statement-breakpoint
ALTER TABLE "page_comment_threads" DROP CONSTRAINT "page_comment_threads_selected_text_check";--> statement-breakpoint
ALTER TABLE "page_comments" DROP CONSTRAINT "page_comments_body_check";--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_summary_check";--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_title_check";--> statement-breakpoint
ALTER TABLE "page_uploads" DROP CONSTRAINT "page_uploads_mime_check";--> statement-breakpoint
ALTER TABLE "page_uploads" DROP CONSTRAINT "page_uploads_original_name_check";--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_label_check";--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_source_path_check";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_name_check";--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_description_check";--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_name_check";--> statement-breakpoint
ALTER TABLE "provider_models" DROP CONSTRAINT "provider_models_model_id_check";--> statement-breakpoint
ALTER TABLE "providers" DROP CONSTRAINT "providers_name_check";--> statement-breakpoint
ALTER TABLE "providers" DROP CONSTRAINT "providers_base_url_check";--> statement-breakpoint
ALTER TABLE "providers" DROP CONSTRAINT "providers_api_key_check";--> statement-breakpoint
ALTER TABLE "resource_comments" DROP CONSTRAINT "resource_comments_body_check";--> statement-breakpoint
ALTER TABLE "resource_comments" DROP CONSTRAINT "resource_comments_anchor_check";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_name_check";--> statement-breakpoint
ALTER TABLE "waves" DROP CONSTRAINT "waves_name_check";--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_body_check";--> statement-breakpoint
DROP INDEX "providers_name_idx";--> statement-breakpoint
DROP INDEX "label_groups_project_id_name_unique";--> statement-breakpoint
DROP INDEX "labels_group_id_name_unique";--> statement-breakpoint
DROP INDEX "labels_project_id_name_unique";--> statement-breakpoint
ALTER TABLE "provider_models" DROP CONSTRAINT "provider_models_pkey";--> statement-breakpoint
ALTER TABLE "agent_start_requests" DROP CONSTRAINT "agent_start_requests_actor_kind_actor_name_request_id_pk";--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_slug_equality" EXCLUDE USING hash (("project_id" || '/' || "slug") WITH =);--> statement-breakpoint
CREATE INDEX "label_groups_project_id_idx" ON "label_groups" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "labels_group_id_idx" ON "labels" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_slug_unique" EXCLUDE USING hash (("project_id" || '/' || "slug") WITH =);--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_project_name_equality" EXCLUDE USING hash ((length("project_id")::text || ':' || "project_id" || "name") WITH =);--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_project_slug_equality" EXCLUDE USING hash ((length("project_id")::text || ':' || "project_id" || "slug") WITH =);--> statement-breakpoint
ALTER TABLE "provider_models" ADD CONSTRAINT "provider_models_identity_equality" EXCLUDE USING hash ((length("provider_id")::text || ':' || "provider_id" || "model_id") WITH =);--> statement-breakpoint
CREATE INDEX "provider_models_provider_id_idx" ON "provider_models" USING btree ("provider_id");--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_name_equality" EXCLUDE USING hash ((lower("name")) WITH =);--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_epic_slug_equality" EXCLUDE USING hash (("epic_id" || '/' || "slug") WITH =);--> statement-breakpoint
ALTER TABLE "agent_start_requests" ADD CONSTRAINT "agent_start_requests_identity" EXCLUDE USING hash ((ARRAY["actor_kind", "actor_name", "request_id"]) WITH =);--> statement-breakpoint
CREATE INDEX "agent_start_requests_request_id_idx" ON "agent_start_requests" USING hash ("request_id");--> statement-breakpoint
ALTER TABLE "label_groups" ADD CONSTRAINT "label_groups_project_id_name_unique" EXCLUDE USING hash ((ARRAY["project_id", lower("name")]) WITH =);--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_group_id_name_unique" EXCLUDE USING hash ((ARRAY["group_id", lower("name")]) WITH =) WHERE ("group_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_name_unique" EXCLUDE USING hash ((ARRAY["project_id", lower("name")]) WITH =) WHERE ("group_id" IS NULL);--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_filename_check" CHECK (length("attachments"."filename") >= 1 AND position('/' IN "attachments"."filename") = 0);--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_title_check" CHECK ("tickets"."title" = btrim("tickets"."title") AND length("tickets"."title") >= 1);--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_name_check" CHECK ("actors"."name" ~ '^[ -~]+$' AND position(':' IN "actors"."name") = 0);--> statement-breakpoint
ALTER TABLE "epic_resources" ADD CONSTRAINT "epic_resources_name_check" CHECK ("epic_resources"."name" = btrim("epic_resources"."name") AND ("epic_resources"."kind" = 'doc' OR length("epic_resources"."name") >= 1));--> statement-breakpoint
ALTER TABLE "epic_resources" ADD CONSTRAINT "epic_resources_url_check" CHECK ("epic_resources"."url" IS NULL OR length("epic_resources"."url") >= 1);--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_name_check" CHECK ("epics"."name" = btrim("epics"."name") AND length("epics"."name") >= 1);--> statement-breakpoint
ALTER TABLE "label_groups" ADD CONSTRAINT "label_groups_name_check" CHECK ("label_groups"."name" = btrim("label_groups"."name") AND length("label_groups"."name") >= 1 AND position(',' IN "label_groups"."name") = 0 AND position('/' IN "label_groups"."name") = 0 AND lower("label_groups"."name") <> 'none');--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_name_check" CHECK ("labels"."name" = btrim("labels"."name") AND length("labels"."name") >= 1 AND position(',' IN "labels"."name") = 0 AND position('/' IN "labels"."name") = 0 AND lower("labels"."name") <> 'none');--> statement-breakpoint
ALTER TABLE "page_assets" ADD CONSTRAINT "page_assets_mime_check" CHECK (length("page_assets"."mime") >= 1 AND "page_assets"."mime" !~ '[[:cntrl:]]');--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_anchor_check" CHECK (jsonb_typeof("page_comment_threads"."anchor") = 'object'
				AND "page_comment_threads"."anchor"->>'kind' IS NOT NULL
				AND "page_comment_threads"."anchor"->>'kind' = "page_comment_threads"."anchor_kind");--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_selected_text_check" CHECK (("page_comment_threads"."anchor_kind" = 'element' AND "page_comment_threads"."selected_text" IS NULL)
				OR ("page_comment_threads"."anchor_kind" = 'text' AND "page_comment_threads"."selected_text" IS NOT NULL
					AND length("page_comment_threads"."selected_text") >= 1));--> statement-breakpoint
ALTER TABLE "page_comments" ADD CONSTRAINT "page_comments_body_check" CHECK (length("page_comments"."body") >= 1);--> statement-breakpoint
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
				AND "page_versions"."source_path" !~ '[[:cntrl:]]');--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_name_check" CHECK (length("projects"."name") >= 1);--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_name_check" CHECK (length("statuses"."name") >= 1);--> statement-breakpoint
ALTER TABLE "provider_models" ADD CONSTRAINT "provider_models_model_id_check" CHECK (length("provider_models"."model_id") >= 1 AND "provider_models"."model_id" !~ '[[:space:][:cntrl:]]');--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_name_check" CHECK ("providers"."name" = btrim("providers"."name") AND length("providers"."name") >= 1);--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_base_url_check" CHECK (length("providers"."base_url") >= 1);--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_api_key_check" CHECK (length("providers"."api_key") >= 1);--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_body_check" CHECK (length("resource_comments"."body") >= 1);--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_anchor_check" CHECK ("resource_comments"."quote" IS NULL OR (length("resource_comments"."quote") >= 1 AND length("resource_comments"."prefix") <= 32 AND length("resource_comments"."suffix") <= 32));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_name_check" CHECK ("sessions"."name" = btrim("sessions"."name") AND char_length("sessions"."name") >= 1);--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_name_check" CHECK ("waves"."name" = btrim("waves"."name") AND length("waves"."name") >= 1);--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_body_check" CHECK (length("notes"."body") >= 1);
