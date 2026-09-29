CREATE TABLE "langflow_document_conversions" (
	"migration_id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"source_version" integer NOT NULL,
	"source_document_hash" text NOT NULL,
	"source_bytes" "bytea" NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "langflow_conversion_version" CHECK ("langflow_document_conversions"."source_version" > 0),
	CONSTRAINT "langflow_conversion_hash" CHECK ("langflow_document_conversions"."source_document_hash" = encode(sha256("langflow_document_conversions"."source_bytes"), 'hex'))
);
--> statement-breakpoint
CREATE TABLE "langflow_document_publication_states" (
	"flow_id" text NOT NULL,
	"revision" integer NOT NULL,
	"version" integer NOT NULL,
	"state" jsonb NOT NULL,
	CONSTRAINT "langflow_document_publication_states_flow_id_revision_pk" PRIMARY KEY("flow_id","revision"),
	CONSTRAINT "langflow_publication_state_version" CHECK ("langflow_document_publication_states"."version" > 0),
	CONSTRAINT "langflow_publication_state_identity" CHECK ((
			("langflow_document_publication_states"."state"->>'revision')::integer = "langflow_document_publication_states"."revision"
			AND "langflow_document_publication_states"."state"->>'state' IN ('not_requested', 'pending', 'failed', 'blocked')
			AND ("langflow_document_publication_states"."state"->>'state' NOT IN ('failed', 'blocked')
				OR (jsonb_typeof("langflow_document_publication_states"."state"->'diagnostics') = 'array' AND jsonb_array_length("langflow_document_publication_states"."state"->'diagnostics') > 0))
		) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "langflow_document_publications" (
	"publication_id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"revision" integer NOT NULL,
	"document_hash" text NOT NULL,
	"component_manifest_hash" text NOT NULL,
	"publication" jsonb NOT NULL,
	CONSTRAINT "langflow_publication_revision" UNIQUE("flow_id","revision"),
	CONSTRAINT "langflow_publication_identity" CHECK ((
			"langflow_document_publications"."publication"->>'publicationId' = "langflow_document_publications"."publication_id"
			AND "langflow_document_publications"."publication"->>'flowId' = "langflow_document_publications"."flow_id"
			AND ("langflow_document_publications"."publication"->>'revision')::integer = "langflow_document_publications"."revision"
			AND "langflow_document_publications"."publication"->>'documentHash' = "langflow_document_publications"."document_hash"
			AND "langflow_document_publications"."publication"->>'componentManifestHash' = "langflow_document_publications"."component_manifest_hash"
		) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "langflow_document_revisions" (
	"flow_id" text NOT NULL,
	"revision" integer NOT NULL,
	"document_hash" text NOT NULL,
	"component_manifest_hash" text,
	"source_bytes" "bytea" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"saved_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "langflow_document_revisions_flow_id_revision_pk" PRIMARY KEY("flow_id","revision"),
	CONSTRAINT "langflow_revision_identity" UNIQUE("flow_id","revision","document_hash","component_manifest_hash"),
	CONSTRAINT "langflow_revision_positive" CHECK ("langflow_document_revisions"."revision" > 0),
	CONSTRAINT "langflow_revision_hash" CHECK ("langflow_document_revisions"."document_hash" = encode(sha256("langflow_document_revisions"."source_bytes"), 'hex')),
	CONSTRAINT "langflow_revision_manifest" CHECK ("langflow_document_revisions"."component_manifest_hash" IS NULL OR "langflow_document_revisions"."component_manifest_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "langflow_revision_snapshot" CHECK ((
			"langflow_document_revisions"."snapshot"->'flow'->>'id' = "langflow_document_revisions"."flow_id"
			AND ("langflow_document_revisions"."snapshot"->>'revision')::integer = "langflow_document_revisions"."revision"
			AND ("langflow_document_revisions"."snapshot"->'flow'->>'version')::integer = "langflow_document_revisions"."revision"
			AND "langflow_document_revisions"."snapshot"->>'documentHash' = "langflow_document_revisions"."document_hash"
			AND ("langflow_document_revisions"."snapshot"->>'schemaVersion')::integer = 1
			AND (("langflow_document_revisions"."snapshot"->>'engine' = 'legacy' AND "langflow_document_revisions"."component_manifest_hash" IS NULL)
				OR ("langflow_document_revisions"."snapshot"->>'engine' = 'langflow' AND "langflow_document_revisions"."component_manifest_hash" IS NOT NULL
					AND "langflow_document_revisions"."snapshot"->>'componentManifestHash' = "langflow_document_revisions"."component_manifest_hash"))
		) IS TRUE)
);
--> statement-breakpoint
CREATE TABLE "langflow_document_save_receipts" (
	"flow_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_bytes" "bytea" NOT NULL,
	"request_hash" text NOT NULL,
	"revision" integer NOT NULL,
	"receipt" jsonb NOT NULL,
	CONSTRAINT "langflow_document_save_receipts_flow_id_request_id_pk" PRIMARY KEY("flow_id","request_id"),
	CONSTRAINT "langflow_save_request_hash" CHECK ("langflow_document_save_receipts"."request_hash" = encode(sha256("langflow_document_save_receipts"."request_bytes"), 'hex')),
	CONSTRAINT "langflow_save_receipt_identity" CHECK ((
			"langflow_document_save_receipts"."receipt"->'flow'->>'id' = "langflow_document_save_receipts"."flow_id"
			AND ("langflow_document_save_receipts"."receipt"->>'revision')::integer = "langflow_document_save_receipts"."revision"
			AND ("langflow_document_save_receipts"."receipt"->'flow'->>'version')::integer = "langflow_document_save_receipts"."revision"
		) IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "langflow_document_conversions" ADD CONSTRAINT "langflow_document_conversions_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_document_publication_states" ADD CONSTRAINT "langflow_publication_state_document" FOREIGN KEY ("flow_id","revision") REFERENCES "public"."langflow_document_revisions"("flow_id","revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_document_publications" ADD CONSTRAINT "langflow_publication_document" FOREIGN KEY ("flow_id","revision","document_hash","component_manifest_hash") REFERENCES "public"."langflow_document_revisions"("flow_id","revision","document_hash","component_manifest_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_document_revisions" ADD CONSTRAINT "langflow_document_revisions_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langflow_document_save_receipts" ADD CONSTRAINT "langflow_save_document" FOREIGN KEY ("flow_id","revision") REFERENCES "public"."langflow_document_revisions"("flow_id","revision") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION reject_langflow_document_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Immutable document records cannot be updated' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER langflow_revision_immutable BEFORE UPDATE ON langflow_document_revisions
FOR EACH ROW EXECUTE FUNCTION reject_langflow_document_update();
--> statement-breakpoint
CREATE TRIGGER langflow_publication_immutable BEFORE UPDATE ON langflow_document_publications
FOR EACH ROW EXECUTE FUNCTION reject_langflow_document_update();
--> statement-breakpoint
CREATE TRIGGER langflow_save_immutable BEFORE UPDATE ON langflow_document_save_receipts
FOR EACH ROW EXECUTE FUNCTION reject_langflow_document_update();
--> statement-breakpoint
CREATE TRIGGER langflow_conversion_immutable BEFORE UPDATE ON langflow_document_conversions
FOR EACH ROW EXECUTE FUNCTION reject_langflow_document_update();
