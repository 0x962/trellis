import type { FlowDocumentV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { langflowDocumentRevisions } from "./revisions";

export const langflowDocumentActions = pgTable(
	"langflow_document_actions",
	{
		flowId: text("flow_id").notNull(),
		requestId: text("request_id").notNull(),
		action: text().$type<"publish" | "convert">().notNull(),
		requestBytes: text("request_bytes").notNull(),
		requestDigest: text("request_digest").notNull(),
		revision: integer().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		document: jsonb().$type<FlowDocumentV1>(),
	},
	(t) => [
		primaryKey({ columns: [t.flowId, t.requestId] }),
		foreignKey({
			columns: [t.flowId, t.revision],
			foreignColumns: [langflowDocumentRevisions.flowId, langflowDocumentRevisions.revision],
		}).onDelete("cascade"),
		check("langflow_document_action_kind", sql`${t.action} IN ('publish', 'convert')`),
		check(
			"langflow_document_action_digest",
			sql`${t.requestDigest} = encode(sha256(convert_to(${t.requestBytes}, 'UTF8')), 'hex')`,
		),
		check(
			"langflow_document_action_result",
			sql`${t.document} IS NULL OR (${t.document}->'flow'->>'id' = ${t.flowId}) IS TRUE`,
		),
	],
);

export const documentActionRowsSql = `
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
`;
