import type { FlowDocumentV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { bytes } from "./bytes.ts";
import { langflowDocumentRevisions } from "./revisions.ts";

export const langflowDocumentSaveReceipts = pgTable(
	"langflow_document_save_receipts",
	{
		flowId: text("flow_id").notNull(),
		requestId: uuid("request_id").notNull(),
		requestBytes: bytes("request_bytes").notNull(),
		requestHash: text("request_hash").notNull(),
		revision: integer().notNull(),
		receipt: jsonb().$type<FlowDocumentV1>().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.flowId, t.requestId] }),
		check("langflow_save_request_hash", sql`${t.requestHash} = encode(sha256(${t.requestBytes}), 'hex')`),
		foreignKey({
			name: "langflow_save_document",
			columns: [t.flowId, t.revision],
			foreignColumns: [langflowDocumentRevisions.flowId, langflowDocumentRevisions.revision],
		}).onDelete("cascade"),
		check(
			"langflow_save_receipt_identity",
			sql`(
			${t.receipt}->'flow'->>'id' = ${t.flowId}
			AND (${t.receipt}->>'revision')::integer = ${t.revision}
			AND (${t.receipt}->'flow'->>'version')::integer = ${t.revision}
		) IS TRUE`,
		),
	],
);
