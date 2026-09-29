import type { FlowPublicationV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { langflowDocumentRevisions } from "./revisions.ts";

export const langflowDocumentPublications = pgTable(
	"langflow_document_publications",
	{
		publicationId: text("publication_id").primaryKey(),
		flowId: text("flow_id").notNull(),
		revision: integer().notNull(),
		documentHash: text("document_hash").notNull(),
		componentManifestHash: text("component_manifest_hash").notNull(),
		publication: jsonb().$type<FlowPublicationV1>().notNull(),
	},
	(t) => [
		unique("langflow_publication_revision").on(t.flowId, t.revision),
		foreignKey({
			name: "langflow_publication_document",
			columns: [t.flowId, t.revision, t.documentHash, t.componentManifestHash],
			foreignColumns: [
				langflowDocumentRevisions.flowId,
				langflowDocumentRevisions.revision,
				langflowDocumentRevisions.documentHash,
				langflowDocumentRevisions.componentManifestHash,
			],
		}).onDelete("cascade"),
		check(
			"langflow_publication_identity",
			sql`(
			${t.publication}->>'publicationId' = ${t.publicationId}
			AND ${t.publication}->>'flowId' = ${t.flowId}
			AND (${t.publication}->>'revision')::integer = ${t.revision}
			AND ${t.publication}->>'documentHash' = ${t.documentHash}
			AND ${t.publication}->>'componentManifestHash' = ${t.componentManifestHash}
		) IS TRUE`,
		),
	],
);
