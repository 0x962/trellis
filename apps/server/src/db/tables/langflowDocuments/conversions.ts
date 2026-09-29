import type { FlowDiagnosticV1 } from "@trellis/api";
import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "../actors.ts";
import { flows } from "../flows.ts";
import { bytes } from "./bytes.ts";

export type DocumentConversionProvenance = {
	sourceExportRef: string;
	converterVersion: string;
	targetEngineVersion: string;
	targetDocumentHash: string | null;
	nodeMap: Record<string, string>;
	edgeMap: Record<string, string>;
	instructionHashes: Record<string, string>;
	diagnostics: FlowDiagnosticV1[];
	state: "converted" | "blocked" | "approved" | "activated";
};

export const langflowDocumentConversions = pgTable(
	"langflow_document_conversions",
	{
		migrationId: text("migration_id").primaryKey(),
		flowId: text("flow_id")
			.notNull()
			.references(() => flows.id, { onDelete: "cascade" }),
		sourceVersion: integer("source_version").notNull(),
		sourceDocumentHash: text("source_document_hash").notNull(),
		sourceBytes: bytes("source_bytes").notNull(),
		provenance: jsonb().$type<DocumentConversionProvenance>().notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		check("langflow_conversion_version", sql`${t.sourceVersion} > 0`),
		check("langflow_conversion_hash", sql`${t.sourceDocumentHash} = encode(sha256(${t.sourceBytes}), 'hex')`),
	],
);
