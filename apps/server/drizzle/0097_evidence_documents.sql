CREATE TABLE "pr_evidence_documents" (
	"pull_request_id" text PRIMARY KEY NOT NULL,
	"head_sha" text NOT NULL,
	"body" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "pr_evidence_documents_head_sha_check" CHECK (length("pr_evidence_documents"."head_sha") BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "pr_files" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"blob_sha256" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "pr_files_blob_sha256_check" CHECK ("pr_files"."blob_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "pr_files_size_check" CHECK ("pr_files"."size" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pr_evidence_documents" ADD CONSTRAINT "pr_evidence_documents_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_evidence_documents" ADD CONSTRAINT "pr_evidence_documents_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_files" ADD CONSTRAINT "pr_files_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_files" ADD CONSTRAINT "pr_files_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_files_pull_request_id_idx" ON "pr_files" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "pr_files_blob_sha256_idx" ON "pr_files" USING btree ("blob_sha256");--> statement-breakpoint
INSERT INTO "pr_files" ("id", "pull_request_id", "blob_sha256", "filename", "mime", "size", "actor_name", "actor_kind", "created_at")
SELECT "id", "pull_request_id", "blob_sha256", "record"->'file'->>'filename', "record"->'file'->>'mime', ("record"->'file'->>'size')::bigint, "actor_name", "actor_kind", "created_at"
FROM "pr_evidence"
WHERE "blob_sha256" IS NOT NULL;
