CREATE TABLE "pr_summaries" (
	"pull_request_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"headline" text NOT NULL,
	"why" text NOT NULL,
	"watch" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "pr_summaries_pkey" PRIMARY KEY("pull_request_id","head_sha")
);
--> statement-breakpoint
ALTER TABLE "pr_summaries" ADD CONSTRAINT "pr_summaries_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;