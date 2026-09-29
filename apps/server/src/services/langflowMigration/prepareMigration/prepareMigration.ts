import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type FlowDiagnosticV1, type FlowDoc, UlidSchema } from "@trellis/api";
import { z } from "zod";
import { inspectSource } from "../inspectSource";
import { sourceDigest } from "../sourceDigest";
import type { BlockedMigrationV1 } from "../types";
import { catalogDiagnostics } from "./components/catalogDiagnostics";

const IdentitySchema = z.object({ flow: z.object({ id: UlidSchema, version: z.number().int().positive() }) });

export const prepareMigration = async (input: {
	exportDirectory: string;
	sourceBytes: Uint8Array;
	targetEngineVersion: string;
	catalogBytes?: Uint8Array;
}): Promise<BlockedMigrationV1> => {
	const sourceBytes = Buffer.from(input.sourceBytes);
	const catalogBytes = input.catalogBytes === undefined ? undefined : Buffer.from(input.catalogBytes);
	const migrationId = randomUUID();
	const directory = join(input.exportDirectory, migrationId);
	await mkdir(directory, { mode: 0o700 });
	const sourceExportRef = join(directory, "source.json");
	await writeFile(sourceExportRef, sourceBytes, { flag: "wx", mode: 0o600 });
	const catalogExportRef = join(directory, "catalog.json");
	if (catalogBytes) await writeFile(catalogExportRef, catalogBytes, { flag: "wx", mode: 0o600 });
	const source: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes));
	const identity = IdentitySchema.parse(source).flow;
	const { manifest, diagnostics } = inspectSource(source);
	const missingCatalog: FlowDiagnosticV1 = {
		code: "production_catalog_unavailable",
		message: "The production component catalog and its exact port mappings are unavailable. Publication is blocked.",
		severity: "error",
		path: [],
	};
	const record: BlockedMigrationV1 = {
		schemaVersion: 1,
		migrationId,
		flowId: identity.id,
		sourceVersion: identity.version,
		sourceDocumentHash: sourceDigest(sourceBytes),
		sourceExportRef,
		converterVersion: "trellis-loss-report-v1",
		targetEngineVersion: input.targetEngineVersion,
		targetDocumentHash: null,
		nodeMap: {},
		edgeMap: {},
		instructionHashes: manifest?.instructionHashes ?? {},
		sourceManifest: manifest,
		...(catalogBytes ? { catalog: { sha256: sourceDigest(catalogBytes), exportRef: catalogExportRef } } : {}),
		diagnostics: [
			...diagnostics,
			...(catalogBytes
				? catalogDiagnostics(catalogBytes, manifest ? (source as FlowDoc) : null, input.targetEngineVersion)
				: [missingCatalog]),
			...(manifest?.nodes ?? []).map(
				(node): FlowDiagnosticV1 => ({
					code: "unsupported_node_mapping",
					message: "The production component cannot preserve this node's behavior, fields, and instruction yet.",
					severity: "error",
					path: ["nodes", node.id],
				}),
			),
			...(manifest?.edges ?? []).map(
				(edge): FlowDiagnosticV1 => ({
					code: "unsupported_edge_mapping",
					message: "The production ports cannot preserve this edge's branch and endpoints yet.",
					severity: "error",
					path: ["edges", edge.id],
				}),
			),
		],
		state: "blocked",
	};
	await writeFile(join(directory, "report.json"), JSON.stringify(record, null, 2), { flag: "wx", mode: 0o600 });
	return record;
};
