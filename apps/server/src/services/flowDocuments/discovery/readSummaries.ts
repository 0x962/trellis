import { sql } from "drizzle-orm";
import { rows, textArray } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import type { DiscoveryStoredFacts } from "./types.ts";

export const readSummaries = (tx: Tx, flowIds: string[]): Promise<DiscoveryStoredFacts[]> =>
	rows<DiscoveryStoredFacts>(
		tx,
		sql`SELECT f.id AS "flowId", r.revision AS "currentRevision", latest.revision AS "latestRevision",
			COALESCE(r.snapshot->>'engine', latest.engine) AS engine,
			r.document_hash AS "documentHash", r.component_manifest_hash AS "componentManifestHash",
			r.snapshot->'diagnostics' AS diagnostics,
			CASE WHEN jsonb_typeof(r.snapshot->'graphDocument'->'nodes') = 'array'
				THEN jsonb_array_length(r.snapshot->'graphDocument'->'nodes') END AS "nodeCount",
			CASE WHEN jsonb_typeof(r.snapshot->'graphDocument'->'edges') = 'array'
				THEN jsonb_array_length(r.snapshot->'graphDocument'->'edges') END AS "edgeCount",
			p.publication, s.state AS "publicationState", last_publication.publication AS "lastExecutablePublication",
			conversion.provenance->>'state' AS "conversionState",
			conversion.provenance->'diagnostics' AS "conversionDiagnostics"
		FROM flows f
		LEFT JOIN langflow_document_revisions r ON r.flow_id = f.id AND r.revision = f.version
		LEFT JOIN LATERAL (
			SELECT revision, snapshot->>'engine' AS engine FROM langflow_document_revisions
			WHERE flow_id = f.id ORDER BY revision DESC LIMIT 1
		) latest ON true
		LEFT JOIN langflow_document_publications p ON p.flow_id = f.id AND p.revision = f.version
		LEFT JOIN langflow_document_publication_states s ON s.flow_id = f.id AND s.revision = f.version
		LEFT JOIN LATERAL (
			SELECT publication FROM langflow_document_publications
			WHERE flow_id = f.id AND revision <= f.version ORDER BY revision DESC LIMIT 1
		) last_publication ON true
		LEFT JOIN LATERAL (
			SELECT provenance FROM langflow_document_conversions
			WHERE flow_id = f.id AND source_version = f.version
			ORDER BY created_at DESC, migration_id DESC LIMIT 1
		) conversion ON true
		WHERE f.id = ANY(${textArray(flowIds)})`,
	);
