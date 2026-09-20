CREATE TABLE "pr_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"kind" text NOT NULL,
	"record" jsonb NOT NULL,
	"blob_sha256" text,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "pr_evidence_kind_check" CHECK ("pr_evidence"."kind" IN ('before', 'after', 'clip', 'console', 'verify', 'test', 'contract', 'migration', 'picture', 'equivalence')),
	CONSTRAINT "pr_evidence_record_check" CHECK (jsonb_typeof("pr_evidence"."record") = 'object'),
	CONSTRAINT "pr_evidence_head_sha_check" CHECK (length("pr_evidence"."head_sha") BETWEEN 1 AND 64),
	CONSTRAINT "pr_evidence_blob_sha256_check" CHECK ("pr_evidence"."blob_sha256" IS NULL OR "pr_evidence"."blob_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "head_sha" text;--> statement-breakpoint
UPDATE pull_requests p SET head_sha = s.head_sha
FROM (
	SELECT DISTINCT ON (pull_request_id) pull_request_id, head_sha
	FROM pr_summaries ORDER BY pull_request_id, created_at DESC
) s
WHERE s.pull_request_id = p.id;--> statement-breakpoint
ALTER TABLE "pr_evidence" ADD CONSTRAINT "pr_evidence_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_evidence" ADD CONSTRAINT "pr_evidence_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_evidence_pr_head_kind_created_idx" ON "pr_evidence" USING btree ("pull_request_id","head_sha","kind","created_at");--> statement-breakpoint
CREATE INDEX "pr_evidence_blob_sha256_idx" ON "pr_evidence" USING btree ("blob_sha256");
