CREATE TABLE "activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"batch_id" text NOT NULL,
	"root_id" text NOT NULL,
	"project_id" text NOT NULL,
	"ticket_id" text,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"field" text,
	"from_value" text,
	"to_value" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "activity_description_check" CHECK ("activity"."field" <> 'description' OR ("activity"."from_value" IS NULL AND "activity"."to_value" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "attachments_filename_check" CHECK (length("attachments"."filename") BETWEEN 1 AND 255 AND position('/' IN "attachments"."filename") = 0),
	CONSTRAINT "attachments_size_check" CHECK ("attachments"."size" > 0),
	CONSTRAINT "attachments_sha256_check" CHECK ("attachments"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"body" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "comments_body_check" CHECK (length("comments"."body") BETWEEN 1 AND 200000)
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"state" text NOT NULL,
	"is_draft" boolean DEFAULT false NOT NULL,
	"head_ref" text DEFAULT '' NOT NULL,
	"base_ref" text DEFAULT '' NOT NULL,
	"review_state" text DEFAULT 'none' NOT NULL,
	"merged_at" timestamp (3) with time zone,
	"closed_at" timestamp (3) with time zone,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ci_state" text DEFAULT 'none' NOT NULL,
	"content_hash" text,
	"fetched_at" timestamp (3) with time zone,
	"fetch_error" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "pull_requests_owner_repo_number_unique" UNIQUE("owner","repo","number"),
	CONSTRAINT "pull_requests_owner_check" CHECK ("pull_requests"."owner" = lower("pull_requests"."owner") AND length("pull_requests"."owner") > 0),
	CONSTRAINT "pull_requests_repo_check" CHECK ("pull_requests"."repo" = lower("pull_requests"."repo") AND length("pull_requests"."repo") > 0),
	CONSTRAINT "pull_requests_number_check" CHECK ("pull_requests"."number" > 0),
	CONSTRAINT "pull_requests_state_check" CHECK ("pull_requests"."state" IN ('open', 'closed', 'merged')),
	CONSTRAINT "pull_requests_review_state_check" CHECK ("pull_requests"."review_state" IN ('none', 'review_required', 'approved', 'changes_requested')),
	CONSTRAINT "pull_requests_ci_state_check" CHECK ("pull_requests"."ci_state" IN ('none', 'pending', 'pass', 'fail')),
	CONSTRAINT "pull_requests_checks_check" CHECK (jsonb_typeof("pull_requests"."checks") = 'array')
);
--> statement-breakpoint
CREATE TABLE "ticket_pull_requests" (
	"ticket_id" text NOT NULL,
	"pull_request_id" text NOT NULL,
	"source" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "ticket_pull_requests_pkey" PRIMARY KEY("ticket_id","pull_request_id"),
	CONSTRAINT "ticket_pull_requests_source_check" CHECK ("ticket_pull_requests"."source" IN ('manual', 'auto'))
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"root_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"status_id" text NOT NULL,
	"parent_id" text,
	"position" double precision NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "tickets_root_id_number_unique" UNIQUE("root_id","number"),
	CONSTRAINT "tickets_id_root_id_unique" UNIQUE("id","root_id"),
	CONSTRAINT "tickets_parent_not_self" CHECK ("tickets"."parent_id" <> "tickets"."id"),
	CONSTRAINT "tickets_number_check" CHECK ("tickets"."number" > 0),
	CONSTRAINT "tickets_title_check" CHECK ("tickets"."title" = btrim("tickets"."title") AND length("tickets"."title") BETWEEN 1 AND 500),
	CONSTRAINT "tickets_priority_check" CHECK ("tickets"."priority" IN ('none', 'urgent', 'high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE TABLE "actors" (
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"first_seen_at" timestamp (3) with time zone NOT NULL,
	"last_seen_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "actors_pkey" PRIMARY KEY("name","kind"),
	CONSTRAINT "actors_name_check" CHECK ("actors"."name" ~ '^[ -~]{1,64}$' AND position(':' IN "actors"."name") = 0),
	CONSTRAINT "actors_kind_check" CHECK ("actors"."kind" IN ('human', 'agent', 'system'))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"root_id" text NOT NULL,
	"key" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ticket_template" text DEFAULT '' NOT NULL,
	"ticket_counter" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "projects_key_unique" UNIQUE("key"),
	CONSTRAINT "projects_id_root_id_unique" UNIQUE("id","root_id"),
	CONSTRAINT "projects_key_check" CHECK ("projects"."key" ~ '^[A-Z][A-Z0-9]{1,9}$'),
	CONSTRAINT "projects_slug_check" CHECK ("projects"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "projects"."slug" NOT IN ('board', 'settings')),
	CONSTRAINT "projects_name_check" CHECK (length("projects"."name") BETWEEN 1 AND 120),
	CONSTRAINT "projects_root_is_self" CHECK (("projects"."parent_id" IS NULL) = ("projects"."root_id" = "projects"."id")),
	CONSTRAINT "projects_root_has_key" CHECK (("projects"."parent_id" IS NULL) = ("projects"."key" IS NOT NULL)),
	CONSTRAINT "projects_parent_not_self" CHECK ("projects"."parent_id" <> "projects"."id"),
	CONSTRAINT "projects_counter_on_root" CHECK ("projects"."parent_id" IS NULL OR "projects"."ticket_counter" = 0)
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	CONSTRAINT "repos_project_id_owner_repo_unique" UNIQUE("project_id","owner","repo"),
	CONSTRAINT "repos_owner_check" CHECK ("repos"."owner" = lower("repos"."owner") AND length("repos"."owner") > 0),
	CONSTRAINT "repos_repo_check" CHECK ("repos"."repo" = lower("repos"."repo") AND length("repos"."repo") > 0)
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"reviewer" text,
	"color" text NOT NULL,
	"position" integer NOT NULL,
	"wip_limit" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "statuses_project_id_name_unique" UNIQUE("project_id","name"),
	CONSTRAINT "statuses_project_id_slug_unique" UNIQUE("project_id","slug"),
	CONSTRAINT "statuses_category_check" CHECK ("statuses"."category" IN ('todo', 'started', 'review', 'done', 'canceled')),
	CONSTRAINT "statuses_reviewer_check" CHECK ("statuses"."reviewer" IN ('human', 'agent')),
	CONSTRAINT "statuses_reviewer_for_review" CHECK (("statuses"."category" = 'review') = ("statuses"."reviewer" IS NOT NULL)),
	CONSTRAINT "statuses_wip_limit_check" CHECK ("statuses"."wip_limit" > 0),
	CONSTRAINT "statuses_name_check" CHECK (length("statuses"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_root_id_projects_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" ADD CONSTRAINT "ticket_pull_requests_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" ADD CONSTRAINT "ticket_pull_requests_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" ADD CONSTRAINT "ticket_pull_requests_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_fk" FOREIGN KEY ("project_id","root_id") REFERENCES "public"."projects"("id","root_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_fk" FOREIGN KEY ("parent_id","root_id") REFERENCES "public"."tickets"("id","root_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_fk" FOREIGN KEY ("parent_id","root_id") REFERENCES "public"."projects"("id","root_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_ticket_id_id_idx" ON "activity" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE INDEX "activity_root_id_id_idx" ON "activity" USING btree ("root_id","id");--> statement-breakpoint
CREATE INDEX "activity_project_id_id_idx" ON "activity" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "activity_created_at_idx" ON "activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "attachments_ticket_id_idx" ON "attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "attachments_sha256_idx" ON "attachments" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "comments_ticket_id_created_at_idx" ON "comments" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "pull_requests_state_ci_state_idx" ON "pull_requests" USING btree ("state","ci_state");--> statement-breakpoint
CREATE INDEX "ticket_pull_requests_pull_request_id_idx" ON "ticket_pull_requests" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "tickets_project_id_status_id_position_idx" ON "tickets" USING btree ("project_id","status_id","position");--> statement-breakpoint
CREATE INDEX "tickets_parent_id_idx" ON "tickets" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tickets_open_idx" ON "tickets" USING btree ("root_id","updated_at" DESC NULLS FIRST) WHERE "tickets"."completed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tickets_completed_idx" ON "tickets" USING btree ("root_id","completed_at" DESC NULLS FIRST) WHERE "tickets"."completed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "projects_root_id_idx" ON "projects" USING btree ("root_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statuses_default_idx" ON "statuses" USING btree ("project_id") WHERE "statuses"."is_default";