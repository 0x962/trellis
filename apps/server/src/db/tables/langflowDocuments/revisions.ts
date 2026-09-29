import type { FlowDocumentSnapshotV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { at } from "../actors.ts";
import { flows } from "../flows.ts";
import { bytes } from "./bytes.ts";

export const langflowDocumentRevisions = pgTable(
	"langflow_document_revisions",
	{
		flowId: text("flow_id")
			.notNull()
			.references(() => flows.id, { onDelete: "cascade" }),
		revision: integer().notNull(),
		documentHash: text("document_hash").notNull(),
		componentManifestHash: text("component_manifest_hash"),
		sourceBytes: bytes("source_bytes").notNull(),
		snapshot: jsonb().$type<FlowDocumentSnapshotV1>().notNull(),
		savedAt: at("saved_at").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.flowId, t.revision] }),
		unique("langflow_revision_identity").on(t.flowId, t.revision, t.documentHash, t.componentManifestHash),
		check("langflow_revision_positive", sql`${t.revision} > 0`),
		check("langflow_revision_hash", sql`${t.documentHash} = encode(sha256(${t.sourceBytes}), 'hex')`),
		check(
			"langflow_revision_manifest",
			sql`${t.componentManifestHash} IS NULL OR ${t.componentManifestHash} ~ '^[a-f0-9]{64}$'`,
		),
		check(
			"langflow_revision_snapshot",
			sql`(
			${t.snapshot}->'flow'->>'id' = ${t.flowId}
			AND (${t.snapshot}->>'revision')::integer = ${t.revision}
			AND (${t.snapshot}->'flow'->>'version')::integer = ${t.revision}
			AND ${t.snapshot}->>'documentHash' = ${t.documentHash}
			AND (${t.snapshot}->>'schemaVersion')::integer = 1
			AND ((${t.snapshot}->>'engine' = 'legacy' AND ${t.componentManifestHash} IS NULL)
				OR (${t.snapshot}->>'engine' = 'langflow' AND ${t.componentManifestHash} IS NOT NULL
					AND ${t.snapshot}->>'componentManifestHash' = ${t.componentManifestHash}))
		) IS TRUE`,
		),
	],
);
