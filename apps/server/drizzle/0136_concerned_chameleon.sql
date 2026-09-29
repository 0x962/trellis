CREATE TABLE "langflow_action_receipts" (
	"permit_id" text PRIMARY KEY NOT NULL,
	"effect_id" text NOT NULL,
	"permit" jsonb NOT NULL,
	"request_bytes" text NOT NULL,
	"request_digest" text NOT NULL,
	"execution_id" text NOT NULL,
	"view_revision" bigint NOT NULL,
	"receipt_id" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"source_bytes" text NOT NULL,
	"source_digest" text NOT NULL,
	CONSTRAINT "langflow_action_effect" UNIQUE("effect_id"),
	CONSTRAINT "langflow_action_request_digest" CHECK ("langflow_action_receipts"."request_digest" = encode(sha256(convert_to("langflow_action_receipts"."request_bytes", 'UTF8')), 'hex')),
	CONSTRAINT "langflow_action_source_digest" CHECK ("langflow_action_receipts"."source_digest" = encode(sha256(convert_to("langflow_action_receipts"."source_bytes", 'UTF8')), 'hex')),
	CONSTRAINT "langflow_action_permit_binding" CHECK ("langflow_action_receipts"."permit"->>'id' = "langflow_action_receipts"."permit_id" AND "langflow_action_receipts"."permit"->'binding'->>'effectId' = "langflow_action_receipts"."effect_id")
);
--> statement-breakpoint
CREATE FUNCTION reject_langflow_action_receipt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Immutable action receipts cannot be changed' USING ERRCODE = '23514';
END;
$$;--> statement-breakpoint
CREATE TRIGGER langflow_action_receipt_immutable BEFORE UPDATE OR DELETE ON langflow_action_receipts
FOR EACH ROW EXECUTE FUNCTION reject_langflow_action_receipt_mutation();
