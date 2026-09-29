import { readFile } from "node:fs/promises";
import type { FlowDiagnosticV1 } from "@trellis/api";
import { sourceDigest } from "../sourceDigest";
import type { MigrationRecordV1 } from "../types";

export const checkMigrationSource = async (
	record: MigrationRecordV1,
	current: { flowId: string; version: number; sourceBytes: Uint8Array; catalogBytes?: Uint8Array },
): Promise<FlowDiagnosticV1[]> => {
	const diagnostics: FlowDiagnosticV1[] = [];
	if (record.catalog) {
		const catalog = await readFile(record.catalog.exportRef);
		if (sourceDigest(catalog) !== record.catalog.sha256) {
			diagnostics.push({
				code: "catalog_export_changed",
				message: "The retained catalog differs from the reviewed bytes.",
				severity: "error",
				path: ["catalog"],
			});
		}
		if (current.catalogBytes === undefined || sourceDigest(current.catalogBytes) !== record.catalog.sha256) {
			diagnostics.push({
				code: "catalog_changed",
				message: "The current catalog is absent or differs from the reviewed bytes.",
				severity: "error",
				path: ["catalog"],
			});
		}
	}
	const retained = await readFile(record.sourceExportRef);
	if (sourceDigest(retained) !== record.sourceDocumentHash) {
		diagnostics.push({
			code: "source_export_changed",
			message: "The retained export differs from the reviewed source bytes. Conversion review is invalid.",
			severity: "error",
			path: ["sourceExportRef"],
		});
	}
	if (
		current.flowId !== record.flowId ||
		current.version !== record.sourceVersion ||
		sourceDigest(current.sourceBytes) !== record.sourceDocumentHash
	) {
		diagnostics.push({
			code: "source_changed",
			message:
				"The current definition differs from the reviewed source. Export and review a new copy before activation.",
			severity: "error",
			path: [],
		});
	}
	return diagnostics;
};
