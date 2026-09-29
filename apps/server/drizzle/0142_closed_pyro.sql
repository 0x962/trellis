CREATE TABLE "langflow_document_actions" (
	"flow_id" text NOT NULL,
	"request_id" text NOT NULL,
	"action" text NOT NULL,
	"request_bytes" text NOT NULL,
	"request_digest" text NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"document" jsonb,
	CONSTRAINT "langflow_document_actions_flow_id_request_id_pk" PRIMARY KEY("flow_id","request_id"),
	CONSTRAINT "langflow_document_action_kind" CHECK ("langflow_document_actions"."action" IN ('publish', 'convert')),
	CONSTRAINT "langflow_document_action_digest" CHECK ("langflow_document_actions"."request_digest" = encode(sha256(convert_to("langflow_document_actions"."request_bytes", 'UTF8')), 'hex')),
	CONSTRAINT "langflow_document_action_result" CHECK ("langflow_document_actions"."document" IS NULL OR ("langflow_document_actions"."document"->'flow'->>'id' = "langflow_document_actions"."flow_id") IS TRUE)
);
--> statement-breakpoint
ALTER TABLE "langflow_document_actions" ADD CONSTRAINT "langflow_document_actions_flow_id_revision_langflow_document_revisions_flow_id_revision_fk" FOREIGN KEY ("flow_id","revision") REFERENCES "public"."langflow_document_revisions"("flow_id","revision") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE FUNCTION guard_langflow_document_action() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF ROW(NEW.flow_id, NEW.request_id, NEW.action, NEW.request_bytes, NEW.request_digest, NEW.revision, NEW.created_at)
		IS DISTINCT FROM ROW(OLD.flow_id, OLD.request_id, OLD.action, OLD.request_bytes, OLD.request_digest, OLD.revision, OLD.created_at)
		OR (OLD.document IS NOT NULL AND NEW.document IS DISTINCT FROM OLD.document) THEN
		RAISE EXCEPTION 'Document action identity and completed receipt are immutable' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER langflow_document_action_immutable BEFORE UPDATE ON langflow_document_actions
FOR EACH ROW EXECUTE FUNCTION guard_langflow_document_action();
