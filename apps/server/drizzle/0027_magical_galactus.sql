CREATE TABLE "review_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"run_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"read_at" timestamp (3) with time zone,
	"attempt" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "review_deliveries_recipient" UNIQUE("review_id","run_id")
);
--> statement-breakpoint
CREATE TABLE "review_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"legacy_id" text NOT NULL,
	"pr_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "review_imports_source" UNIQUE("source","pr_id","legacy_id")
);
--> statement-breakpoint
CREATE TABLE "review_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"pr_id" text NOT NULL,
	"base_sha" text NOT NULL,
	"head_sha" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "review_revisions_commit_pair" UNIQUE("pr_id","base_sha","head_sha")
);
--> statement-breakpoint
CREATE TABLE "review_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"pr_id" text NOT NULL,
	"request_id" text NOT NULL,
	"actor" text NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "review_submissions_request" UNIQUE("pr_id","actor","request_id")
);
--> statement-breakpoint
CREATE TABLE "review_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"pr_id" text NOT NULL,
	"revision_id" text,
	"document" jsonb NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "review_retained" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "review_deliveries" ADD CONSTRAINT "review_deliveries_review_id_review_submissions_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_imports" ADD CONSTRAINT "review_imports_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_imports" ADD CONSTRAINT "review_imports_thread_id_review_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."review_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_revisions" ADD CONSTRAINT "review_revisions_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_submissions" ADD CONSTRAINT "review_submissions_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_threads" ADD CONSTRAINT "review_threads_revision_id_review_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."review_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_threads_pr_updated" ON "review_threads" USING btree ("pr_id","updated_at");