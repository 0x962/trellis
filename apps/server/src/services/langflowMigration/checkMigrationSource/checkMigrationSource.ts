import { readFile } from "node:fs/promises";
import type { FlowDiagnosticV1 } from "@trellis/api";
import { sourceDigest } from "../sourceDigest";
import type { MigrationRecordV1 } from "../types";

export const checkMigrationSource = async (
	record: MigrationRecordV1,
	current: { flowId: string; version: number; sourceBytes: Uint8Array },
): Promise<FlowDiagnosticV1[]> => {
	const diagnostics: FlowDiagnosticV1[] = [];
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
