CREATE TABLE "langflow_authority_commits" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"commit" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "langflow_owner_fences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_key" text[] NOT NULL,
	"revocation" jsonb
);
--> statement-breakpoint
ALTER TABLE "langflow_authority_commits" ADD CONSTRAINT "langflow_authority_commits_receipt_id_langflow_ownership_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."langflow_ownership_receipts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE langflow_owner_fences ADD CONSTRAINT langflow_owner_fence_identity
EXCLUDE USING hash (owner_key WITH =);
CREATE FUNCTION retain_langflow_owner_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Owner fences cannot be deleted' USING ERRCODE = '23514'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_key IS DISTINCT FROM OLD.owner_key
 OR (OLD.revocation IS NOT NULL AND NEW.revocation IS DISTINCT FROM OLD.revocation)
 THEN RAISE EXCEPTION 'Owner revocations are immutable' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retain_langflow_owner_fence BEFORE UPDATE OR DELETE ON langflow_owner_fences
FOR EACH ROW EXECUTE FUNCTION retain_langflow_owner_fence();
CREATE FUNCTION retain_langflow_authority_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Authority commits are immutable' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER retain_langflow_authority_commit BEFORE UPDATE ON langflow_authority_commits
FOR EACH ROW EXECUTE FUNCTION retain_langflow_authority_commit();