import { readFile } from "node:fs/promises";
import { checkMigrationSource } from "../checkMigrationSource";
import type { BlockedConversionIntakeV1 } from "../conversionIntakeTypes";
import { sourceDigest } from "../sourceDigest";

export const checkConversionIntake = async (
	intake: BlockedConversionIntakeV1,
	current: Parameters<typeof checkMigrationSource>[1] & { expansionBytes: Uint8Array },
) => {
	const diagnostics = await checkMigrationSource(intake.record, current);
	for (const [name, retained] of Object.entries({ expansion: intake.expansion, candidate: intake.candidate })) {
		if (retained === null) continue;
		if (sourceDigest(await readFile(retained.exportRef)) !== retained.sha256) {
			diagnostics.push({
				code: "conversion_export_changed",
				message: "The retained producer expansion or candidate differs from its recorded bytes.",
				severity: "error",
				path: [name],
			});
		}
	}
	if (sourceDigest(current.expansionBytes) !== intake.expansion.sha256) {
		diagnostics.push({
			code: "conversion_expansion_changed",
			message: "The current producer expansion differs from the reviewed bytes.",
			severity: "error",
			path: ["expansion"],
		});
	}
	return diagnostics;
};
