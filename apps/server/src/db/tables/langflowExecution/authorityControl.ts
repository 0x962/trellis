import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { AuthorityCommit, OwnerRevocation } from "../../../langflowHost/contracts";
import { langflowOwnershipReceipts } from "./effects";

export const langflowOwnerFences = pgTable("langflow_owner_fences", {
	id: uuid().primaryKey(),
	ownerKey: text("owner_key").array().notNull(),
	revocation: jsonb().$type<OwnerRevocation>(),
});

export const langflowAuthorityCommits = pgTable("langflow_authority_commits", {
	receiptId: text("receipt_id")
		.primaryKey()
		.references(() => langflowOwnershipReceipts.id, { onDelete: "cascade" }),
	commit: jsonb().$type<AuthorityCommit>().notNull(),
});

export const authorityControlRowsSql = `
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
FOR EACH ROW EXECUTE FUNCTION retain_langflow_authority_commit();`;
