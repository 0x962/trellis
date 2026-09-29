import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { documentBytes } from "../../flowDocuments";
import type { BlockedConversionIntakeV1 } from "../conversionIntakeTypes";
import { inspectConversionGraph } from "../inspectConversionGraph";
import { prepareMigration } from "../prepareMigration";
import { sourceDigest } from "../sourceDigest";

export const prepareConversionIntake = async (input: {
	exportDirectory: string;
	sourceBytes: Uint8Array;
	catalogBytes: Uint8Array;
	expansionBytes: Uint8Array;
	targetEngineVersion: string;
}): Promise<BlockedConversionIntakeV1> => {
	const sourceBytes = Buffer.from(input.sourceBytes);
	const catalogBytes = Buffer.from(input.catalogBytes);
	const expansionBytes = Buffer.from(input.expansionBytes);
	const record = await prepareMigration({ ...input, sourceBytes, catalogBytes });
	const directory = dirname(record.sourceExportRef);
	const exportRef = join(directory, "expansion.json");
	await writeFile(exportRef, expansionBytes, { flag: "wx", mode: 0o600 });
	const inspected = inspectConversionGraph({
		sourceBytes,
		catalogBytes,
		expansion: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(expansionBytes)),
	});
	const result: BlockedConversionIntakeV1 = {
		state: "blocked",
		record: { ...record, diagnostics: [...record.diagnostics, ...inspected.diagnostics] },
		expansion: { sha256: sourceDigest(expansionBytes), exportRef },
		candidate: null,
	};
	if (inspected.graphDocument !== null) {
		const candidateBytes = documentBytes(inspected.graphDocument);
		const candidateRef = join(directory, "candidate.json");
		await writeFile(candidateRef, candidateBytes, { flag: "wx", mode: 0o600 });
		result.candidate = { sha256: sourceDigest(candidateBytes), exportRef: candidateRef };
	}
	await writeFile(join(directory, "intake.json"), documentBytes(result), { flag: "wx", mode: 0o600 });
	return result;
};
