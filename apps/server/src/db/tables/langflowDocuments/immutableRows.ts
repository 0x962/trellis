import { sql } from "drizzle-orm";

// Updates would change the bytes that an existing receipt or execution identifies.
// Deletes follow the flow catalog cascades and preserve the catalog deletion policy.
export const immutableDocumentRowsSql = sql.raw(`
CREATE FUNCTION reject_langflow_document_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Immutable document records cannot be updated' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER langflow_revision_immutable BEFORE UPDATE ON langflow_document_revisions
FOR EACH ROW EXECUTE FUNCTION reject_langflow_document_update();
CREATE TRIGGER langflow_publication_immutable BEFORE UPDATE ON langflow_document_publications
FOR EACH ROW EXECUTE FUNCTION reject_langflow_document_update();
CREATE TRIGGER langflow_save_immutable BEFORE UPDATE ON langflow_document_save_receipts
FOR EACH ROW EXECUTE FUNCTION reject_langflow_document_update();
CREATE TRIGGER langflow_conversion_immutable BEFORE UPDATE ON langflow_document_conversions
FOR EACH ROW EXECUTE FUNCTION reject_langflow_document_update();
`);
