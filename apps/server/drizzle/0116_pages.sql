DO $$
DECLARE
	conflicting_project RECORD;
BEGIN
	SELECT key, name INTO conflicting_project FROM projects WHERE slug = 'pages';
	IF FOUND THEN
		RAISE EXCEPTION 'Cannot add Pages because project % ("%") uses the reserved slug "pages".',
			conflicting_project.key, conflicting_project.name;
	END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "page_assets" (
	"page_id" text NOT NULL,
	"version" integer NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"size" bigint NOT NULL,
	"mime" text NOT NULL,
	CONSTRAINT "page_assets_pkey" PRIMARY KEY("page_id","version","path"),
	CONSTRAINT "page_assets_path_check" CHECK (octet_length("page_assets"."path") BETWEEN 1 AND 1024
				AND left("page_assets"."path", 1) <> '/'
				AND "page_assets"."path" !~* '^[a-z]:/'
				AND position(E'\\' IN "page_assets"."path") = 0
				AND position('//' IN "page_assets"."path") = 0
				AND right("page_assets"."path", 1) <> '/'
				AND "page_assets"."path" !~ '(^|/)\.\.?(/|$)'
				AND "page_assets"."path" !~ '[[:cntrl:]]'
				AND lower("page_assets"."path") <> 'index.html'
				AND lower("page_assets"."path") <> '.trellis'
				AND lower("page_assets"."path") NOT LIKE '.trellis/%'),
	CONSTRAINT "page_assets_sha256_check" CHECK ("page_assets"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "page_assets_size_check" CHECK ("page_assets"."size" >= 0 AND "page_assets"."size" <= 104857600),
	CONSTRAINT "page_assets_mime_check" CHECK (length("page_assets"."mime") BETWEEN 1 AND 255 AND "page_assets"."mime" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
CREATE TABLE "page_comment_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"version" integer NOT NULL,
	"anchor_kind" text NOT NULL,
	"anchor" jsonb NOT NULL,
	"selected_text" text,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"resolved_at" timestamp (3) with time zone,
	"resolved_by_name" text,
	"resolved_by_kind" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "page_comment_threads_anchor_kind_check" CHECK ("page_comment_threads"."anchor_kind" IN ('element', 'text')),
	CONSTRAINT "page_comment_threads_anchor_check" CHECK (jsonb_typeof("page_comment_threads"."anchor") = 'object'
				AND "page_comment_threads"."anchor"->>'kind' IS NOT NULL
				AND "page_comment_threads"."anchor"->>'kind' = "page_comment_threads"."anchor_kind"
				AND octet_length("page_comment_threads"."anchor"::text) <= 16384),
	CONSTRAINT "page_comment_threads_selected_text_check" CHECK (("page_comment_threads"."anchor_kind" = 'element' AND "page_comment_threads"."selected_text" IS NULL)
				OR ("page_comment_threads"."anchor_kind" = 'text' AND "page_comment_threads"."selected_text" IS NOT NULL
					AND length("page_comment_threads"."selected_text") BETWEEN 1 AND 2000)),
	CONSTRAINT "page_comment_threads_resolved_check" CHECK (("page_comment_threads"."resolved_at" IS NULL) = ("page_comment_threads"."resolved_by_name" IS NULL)
				AND ("page_comment_threads"."resolved_at" IS NULL) = ("page_comment_threads"."resolved_by_kind" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "page_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"body" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "page_comments_body_check" CHECK (length("page_comments"."body") BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "page_pins" (
	"page_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "page_pins_pkey" PRIMARY KEY("page_id","actor_name","actor_kind")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"latest_version" integer DEFAULT 1 NOT NULL,
	"creator_actor_name" text NOT NULL,
	"creator_actor_kind" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"deleted_actor_name" text,
	"deleted_actor_kind" text,
	CONSTRAINT "pages_project_id_slug_unique" UNIQUE("project_id","slug"),
	CONSTRAINT "pages_slug_check" CHECK ("pages"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "pages_title_check" CHECK ("pages"."title" = btrim("pages"."title") AND length("pages"."title") BETWEEN 1 AND 200),
	CONSTRAINT "pages_summary_check" CHECK (length("pages"."summary") <= 2000),
	CONSTRAINT "pages_version_check" CHECK ("pages"."version" > 0),
	CONSTRAINT "pages_latest_version_check" CHECK ("pages"."latest_version" > 0 AND "pages"."latest_version" <= "pages"."version"),
	CONSTRAINT "pages_deleted_check" CHECK (("pages"."deleted_at" IS NULL) = ("pages"."deleted_actor_name" IS NULL)
				AND ("pages"."deleted_at" IS NULL) = ("pages"."deleted_actor_kind" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "page_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"sha256" text NOT NULL,
	"size" bigint NOT NULL,
	"mime" text NOT NULL,
	"original_name" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "page_uploads_sha256_check" CHECK ("page_uploads"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "page_uploads_size_check" CHECK ("page_uploads"."size" >= 0 AND "page_uploads"."size" <= 104857600),
	CONSTRAINT "page_uploads_mime_check" CHECK (length("page_uploads"."mime") BETWEEN 1 AND 255 AND "page_uploads"."mime" !~ '[[:cntrl:]]'),
	CONSTRAINT "page_uploads_original_name_check" CHECK (length("page_uploads"."original_name") BETWEEN 1 AND 255
				AND position('/' IN "page_uploads"."original_name") = 0
				AND position(E'\\' IN "page_uploads"."original_name") = 0
				AND "page_uploads"."original_name" !~ '[[:cntrl:]]'),
	CONSTRAINT "page_uploads_expiry_check" CHECK ("page_uploads"."expires_at" > "page_uploads"."created_at")
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"page_id" text NOT NULL,
	"number" integer NOT NULL,
	"request_id" text NOT NULL,
	"label" text,
	"document_sha256" text NOT NULL,
	"document_size" bigint NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"source_agent_id" text,
	"source_path" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "page_versions_pkey" PRIMARY KEY("page_id","number"),
	CONSTRAINT "page_versions_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "page_versions_number_check" CHECK ("page_versions"."number" > 0),
	CONSTRAINT "page_versions_label_check" CHECK ("page_versions"."label" IS NULL OR length("page_versions"."label") BETWEEN 1 AND 200),
	CONSTRAINT "page_versions_document_sha256_check" CHECK ("page_versions"."document_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "page_versions_document_size_check" CHECK ("page_versions"."document_size" > 0 AND "page_versions"."document_size" <= 16777216),
	CONSTRAINT "page_versions_search_text_check" CHECK (octet_length("page_versions"."search_text") <= 1048576),
	CONSTRAINT "page_versions_source_path_check" CHECK (length("page_versions"."source_path") BETWEEN 1 AND 4096
				AND left("page_versions"."source_path", 1) <> '/'
				AND "page_versions"."source_path" !~* '^[a-z]:/'
				AND position(E'\\' IN "page_versions"."source_path") = 0
				AND position('//' IN "page_versions"."source_path") = 0
				AND right("page_versions"."source_path", 1) <> '/'
				AND "page_versions"."source_path" !~ '(^|/)\.\.?(/|$)'
				AND "page_versions"."source_path" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
CREATE TABLE "page_watches" (
	"page_id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"cursor_at" timestamp (3) with time zone,
	"cursor_id" text,
	"reservation_id" text,
	"reservation_expires_at" timestamp (3) with time zone,
	"reservation_end_at" timestamp (3) with time zone,
	"reservation_end_id" text,
	"last_completed_reservation_id" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "page_watches_cursor_check" CHECK (("page_watches"."cursor_at" IS NULL) = ("page_watches"."cursor_id" IS NULL)),
	CONSTRAINT "page_watches_reservation_check" CHECK (("page_watches"."reservation_id" IS NULL) = ("page_watches"."reservation_expires_at" IS NULL)
				AND ("page_watches"."reservation_id" IS NULL) = ("page_watches"."reservation_end_at" IS NULL)
				AND ("page_watches"."reservation_id" IS NULL) = ("page_watches"."reservation_end_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_check";--> statement-breakpoint
ALTER TABLE "page_assets" ADD CONSTRAINT "page_assets_version_fk" FOREIGN KEY ("page_id","version") REFERENCES "public"."page_versions"("page_id","number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_version_fk" FOREIGN KEY ("page_id","version") REFERENCES "public"."page_versions"("page_id","number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_resolved_by_fk" FOREIGN KEY ("resolved_by_name","resolved_by_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comments" ADD CONSTRAINT "page_comments_thread_id_page_comment_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."page_comment_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comments" ADD CONSTRAINT "page_comments_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_pins" ADD CONSTRAINT "page_pins_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_pins" ADD CONSTRAINT "page_pins_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_creator_actor_fk" FOREIGN KEY ("creator_actor_name","creator_actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_deleted_actor_fk" FOREIGN KEY ("deleted_actor_name","deleted_actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_uploads" ADD CONSTRAINT "page_uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_uploads" ADD CONSTRAINT "page_uploads_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_source_agent_id_agent_runs_id_fk" FOREIGN KEY ("source_agent_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_watches" ADD CONSTRAINT "page_watches_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_watches" ADD CONSTRAINT "page_watches_agent_id_agent_runs_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_assets_sha256_idx" ON "page_assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "page_comment_threads_page_version_created_idx" ON "page_comment_threads" USING btree ("page_id","version","created_at","id");--> statement-breakpoint
CREATE INDEX "page_comment_threads_open_idx" ON "page_comment_threads" USING btree ("page_id","created_at","id") WHERE "page_comment_threads"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "page_comments_thread_created_idx" ON "page_comments" USING btree ("thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "page_pins_actor_idx" ON "page_pins" USING btree ("actor_kind","actor_name","created_at","page_id");--> statement-breakpoint
CREATE INDEX "pages_deleted_at_idx" ON "pages" USING btree ("deleted_at") WHERE "pages"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "page_uploads_project_actor_idx" ON "page_uploads" USING btree ("project_id","actor_kind","actor_name","created_at");--> statement-breakpoint
CREATE INDEX "page_uploads_sha256_idx" ON "page_uploads" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "page_uploads_expires_at_idx" ON "page_uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "page_versions_document_sha256_idx" ON "page_versions" USING btree ("document_sha256");--> statement-breakpoint
CREATE INDEX "page_versions_source_agent_id_idx" ON "page_versions" USING btree ("source_agent_id");--> statement-breakpoint
CREATE INDEX "page_versions_actor_created_at_idx" ON "page_versions" USING btree ("actor_kind","actor_name","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "page_watches_agent_id_idx" ON "page_watches" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "page_watches_reservation_expires_at_idx" ON "page_watches" USING btree ("reservation_expires_at") WHERE "page_watches"."reservation_expires_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_check" CHECK ("projects"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "projects"."slug" NOT IN ('board', 'pages', 'settings'));
