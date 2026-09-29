ALTER TABLE "actors" ADD COLUMN "id" uuid;--> statement-breakpoint
UPDATE "actors" SET "id" = gen_random_uuid();--> statement-breakpoint
ALTER TABLE "actors" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "actors" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "epic_resources" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "epics" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD COLUMN "resolved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "page_comments" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "page_pins" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "creator_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "deleted_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "page_uploads" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "page_versions" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_evidence" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_evidence_documents" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_files" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "pr_flow_waivers" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "resource_comments" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "resource_comments" ADD COLUMN "resolved_by_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
UPDATE "activity" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "attachments" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "comments" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "ticket_pull_requests" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "epic_resources" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "epics" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "page_comment_threads" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "page_comment_threads" child SET "resolved_by_id" = actor."id" FROM "actors" actor WHERE child."resolved_by_name" = actor."name" AND child."resolved_by_kind" = actor."kind";--> statement-breakpoint
UPDATE "page_comments" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "page_pins" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "pages" child SET "creator_actor_id" = actor."id" FROM "actors" actor WHERE child."creator_actor_name" = actor."name" AND child."creator_actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "pages" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "pages" child SET "deleted_actor_id" = actor."id" FROM "actors" actor WHERE child."deleted_actor_name" = actor."name" AND child."deleted_actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "page_uploads" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "page_versions" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "pr_evidence" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "pr_evidence_documents" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "pr_files" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "pr_flow_waivers" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "resource_comments" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
UPDATE "resource_comments" child SET "resolved_by_id" = actor."id" FROM "actors" actor WHERE child."resolved_by_name" = actor."name" AND child."resolved_by_kind" = actor."kind";--> statement-breakpoint
UPDATE "notes" child SET "actor_id" = actor."id" FROM "actors" actor WHERE child."actor_name" = actor."name" AND child."actor_kind" = actor."kind";--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "activity" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "attachments" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "comments" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "ticket_pull_requests" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "epic_resources" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "epics" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "page_comment_threads" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "page_comment_threads" child LEFT JOIN "actors" actor ON actor."id" = child."resolved_by_id" AND actor."name" = child."resolved_by_name" AND actor."kind" = child."resolved_by_kind" WHERE child."resolved_at" IS NOT NULL AND actor."id" IS NULL
		UNION ALL SELECT 1 FROM "page_comments" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "page_pins" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "pages" child LEFT JOIN "actors" actor ON actor."id" = child."creator_actor_id" AND actor."name" = child."creator_actor_name" AND actor."kind" = child."creator_actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "pages" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "pages" child LEFT JOIN "actors" actor ON actor."id" = child."deleted_actor_id" AND actor."name" = child."deleted_actor_name" AND actor."kind" = child."deleted_actor_kind" WHERE child."deleted_at" IS NOT NULL AND actor."id" IS NULL
		UNION ALL SELECT 1 FROM "page_uploads" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "page_versions" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "pr_evidence" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "pr_evidence_documents" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "pr_files" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "pr_flow_waivers" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "resource_comments" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
		UNION ALL SELECT 1 FROM "resource_comments" child LEFT JOIN "actors" actor ON actor."id" = child."resolved_by_id" AND actor."name" = child."resolved_by_name" AND actor."kind" = child."resolved_by_kind" WHERE child."resolved_at" IS NOT NULL AND actor."id" IS NULL
		UNION ALL SELECT 1 FROM "notes" child LEFT JOIN "actors" actor ON actor."id" = child."actor_id" AND actor."name" = child."actor_name" AND actor."kind" = child."actor_kind" WHERE actor."id" IS NULL
	) THEN
		RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'An actor relationship does not match an actors row.';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "activity" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "epic_resources" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "epics" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "page_comments" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "page_pins" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "creator_actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "page_uploads" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "page_versions" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_evidence" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_evidence_documents" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_files" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_flow_waivers" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_comments" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "actor_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_actor_fk";--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_actor_fk";--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_actor_fk";--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" DROP CONSTRAINT "ticket_pull_requests_actor_fk";--> statement-breakpoint
ALTER TABLE "epic_resources" DROP CONSTRAINT "epic_resources_actor_fk";--> statement-breakpoint
ALTER TABLE "epics" DROP CONSTRAINT "epics_actor_fk";--> statement-breakpoint
ALTER TABLE "page_comment_threads" DROP CONSTRAINT "page_comment_threads_actor_fk";--> statement-breakpoint
ALTER TABLE "page_comment_threads" DROP CONSTRAINT "page_comment_threads_resolved_by_fk";--> statement-breakpoint
ALTER TABLE "page_comments" DROP CONSTRAINT "page_comments_actor_fk";--> statement-breakpoint
ALTER TABLE "page_pins" DROP CONSTRAINT "page_pins_actor_fk";--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_creator_actor_fk";--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_actor_fk";--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_deleted_actor_fk";--> statement-breakpoint
ALTER TABLE "page_uploads" DROP CONSTRAINT "page_uploads_actor_fk";--> statement-breakpoint
ALTER TABLE "page_versions" DROP CONSTRAINT "page_versions_actor_fk";--> statement-breakpoint
ALTER TABLE "pr_evidence" DROP CONSTRAINT "pr_evidence_actor_fk";--> statement-breakpoint
ALTER TABLE "pr_evidence_documents" DROP CONSTRAINT "pr_evidence_documents_actor_fk";--> statement-breakpoint
ALTER TABLE "pr_files" DROP CONSTRAINT "pr_files_actor_fk";--> statement-breakpoint
ALTER TABLE "pr_flow_waivers" DROP CONSTRAINT "pr_flow_waivers_actor_fk";--> statement-breakpoint
ALTER TABLE "resource_comments" DROP CONSTRAINT "resource_comments_actor_fk";--> statement-breakpoint
ALTER TABLE "resource_comments" DROP CONSTRAINT "resource_comments_resolved_by_fk";--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_actor_fk";--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_dedupe_unique";--> statement-breakpoint
ALTER TABLE "actors" DROP CONSTRAINT "actors_pkey";--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_identity_equality" EXCLUDE USING hash ((ARRAY["kind", "name"]) WITH =);--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_pull_requests" ADD CONSTRAINT "ticket_pull_requests_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epic_resources" ADD CONSTRAINT "epic_resources_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_resolved_by_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_comments" ADD CONSTRAINT "page_comments_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_pins" ADD CONSTRAINT "page_pins_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_creator_actor_fk" FOREIGN KEY ("creator_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_deleted_actor_fk" FOREIGN KEY ("deleted_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_uploads" ADD CONSTRAINT "page_uploads_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_evidence" ADD CONSTRAINT "pr_evidence_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_evidence_documents" ADD CONSTRAINT "pr_evidence_documents_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_files" ADD CONSTRAINT "pr_files_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_flow_waivers" ADD CONSTRAINT "pr_flow_waivers_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_resolved_by_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_dedupe_unique" UNIQUE("ticket_id", "actor_id", "dedupe_key");--> statement-breakpoint
ALTER TABLE "page_comment_threads" DROP CONSTRAINT "page_comment_threads_resolved_check";--> statement-breakpoint
ALTER TABLE "page_comment_threads" ADD CONSTRAINT "page_comment_threads_resolved_check" CHECK (("resolved_at" IS NULL) = ("resolved_by_id" IS NULL) AND ("resolved_at" IS NULL) = ("resolved_by_name" IS NULL) AND ("resolved_at" IS NULL) = ("resolved_by_kind" IS NULL));--> statement-breakpoint
ALTER TABLE "pages" DROP CONSTRAINT "pages_deleted_check";--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_actor_id" IS NULL) AND ("deleted_at" IS NULL) = ("deleted_actor_name" IS NULL) AND ("deleted_at" IS NULL) = ("deleted_actor_kind" IS NULL));--> statement-breakpoint
ALTER TABLE "resource_comments" DROP CONSTRAINT "resource_comments_resolved_check";--> statement-breakpoint
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_resolved_check" CHECK (("resolved_at" IS NULL) = ("resolved_by_id" IS NULL) AND ("resolved_at" IS NULL) = ("resolved_by_name" IS NULL) AND ("resolved_at" IS NULL) = ("resolved_by_kind" IS NULL));--> statement-breakpoint
CREATE FUNCTION "reject_actor_identity_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."name" IS DISTINCT FROM OLD."name" OR NEW."kind" IS DISTINCT FROM OLD."kind" THEN
		RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Actor identity fields are immutable.';
	END IF;
	RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "actors_identity_immutable" BEFORE UPDATE OF "id", "name", "kind" ON "actors" FOR EACH ROW EXECUTE FUNCTION "reject_actor_identity_change"();--> statement-breakpoint
CREATE FUNCTION "enforce_actor_binding"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	bound_id uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
	bound_name text := to_jsonb(NEW) ->> TG_ARGV[1];
	bound_kind text := to_jsonb(NEW) ->> TG_ARGV[2];
	required_role boolean := TG_ARGV[3] = 'required';
BEGIN
	IF bound_id IS NULL AND bound_name IS NULL AND bound_kind IS NULL THEN
		IF required_role THEN
			RAISE EXCEPTION USING ERRCODE = '23502', MESSAGE = 'A required actor binding cannot be null.';
		END IF;
		RETURN NEW;
	END IF;
	IF bound_id IS NULL OR bound_name IS NULL OR bound_kind IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An actor binding must contain an id, name, and kind.';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM "actors" WHERE "id" = bound_id AND "name" = bound_name AND "kind" = bound_kind) THEN
		RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'An actor binding must match one actors row.';
	END IF;
	RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "activity_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "activity" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "attachments_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "attachments" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "comments_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "comments" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "ticket_pull_requests_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "ticket_pull_requests" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "epic_resources_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "epic_resources" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "epics_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "epics" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "page_comment_threads_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "page_comment_threads" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "page_comment_threads_resolved_by_binding" BEFORE INSERT OR UPDATE OF "resolved_by_id", "resolved_by_name", "resolved_by_kind" ON "page_comment_threads" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('resolved_by_id', 'resolved_by_name', 'resolved_by_kind', 'optional');--> statement-breakpoint
CREATE TRIGGER "page_comments_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "page_comments" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "page_pins_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "page_pins" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "pages_creator_actor_binding" BEFORE INSERT OR UPDATE OF "creator_actor_id", "creator_actor_name", "creator_actor_kind" ON "pages" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('creator_actor_id', 'creator_actor_name', 'creator_actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "pages_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "pages" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "pages_deleted_actor_binding" BEFORE INSERT OR UPDATE OF "deleted_actor_id", "deleted_actor_name", "deleted_actor_kind" ON "pages" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('deleted_actor_id', 'deleted_actor_name', 'deleted_actor_kind', 'optional');--> statement-breakpoint
CREATE TRIGGER "page_uploads_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "page_uploads" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "page_versions_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "page_versions" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "pr_evidence_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "pr_evidence" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "pr_evidence_documents_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "pr_evidence_documents" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "pr_files_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "pr_files" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "pr_flow_waivers_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "pr_flow_waivers" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "resource_comments_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "resource_comments" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');--> statement-breakpoint
CREATE TRIGGER "resource_comments_resolved_by_binding" BEFORE INSERT OR UPDATE OF "resolved_by_id", "resolved_by_name", "resolved_by_kind" ON "resource_comments" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('resolved_by_id', 'resolved_by_name', 'resolved_by_kind', 'optional');--> statement-breakpoint
CREATE TRIGGER "notes_actor_binding" BEFORE INSERT OR UPDATE OF "actor_id", "actor_name", "actor_kind" ON "notes" FOR EACH ROW EXECUTE FUNCTION "enforce_actor_binding"('actor_id', 'actor_name', 'actor_kind', 'required');
