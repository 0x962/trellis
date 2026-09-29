import type { FlowPublicationStateV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { langflowDocumentRevisions } from "./revisions.ts";

export type UnpublishedDocumentState = Exclude<FlowPublicationStateV1, { state: "published" }>;

export const langflowDocumentPublicationStates = pgTable(
	"langflow_document_publication_states",
	{
		flowId: text("flow_id").notNull(),
		revision: integer().notNull(),
		version: integer().notNull(),
		state: jsonb().$type<UnpublishedDocumentState>().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.flowId, t.revision] }),
		foreignKey({
			name: "langflow_publication_state_document",
			columns: [t.flowId, t.revision],
			foreignColumns: [langflowDocumentRevisions.flowId, langflowDocumentRevisions.revision],
		}).onDelete("cascade"),
		check("langflow_publication_state_version", sql`${t.version} > 0`),
		check(
			"langflow_publication_state_identity",
			sql`(
			(${t.state}->>'revision')::integer = ${t.revision}
			AND ${t.state}->>'state' IN ('not_requested', 'pending', 'failed', 'blocked')
			AND (${t.state}->>'state' NOT IN ('failed', 'blocked')
				OR (jsonb_typeof(${t.state}->'diagnostics') = 'array' AND jsonb_array_length(${t.state}->'diagnostics') > 0))
		) IS TRUE`,
		),
	],
);
