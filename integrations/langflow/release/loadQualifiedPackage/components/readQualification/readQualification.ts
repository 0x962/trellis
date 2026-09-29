import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PackageQualificationSchema } from "../../../packageQualification";

export async function readQualification(path: string, expectedSha256: string) {
	if (!(await lstat(path)).isFile()) throw new Error("qualification_file_not_regular");
	const bytes = await readFile(path);
	if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) {
		throw new Error("qualification_digest_mismatch");
	}
	const proof = PackageQualificationSchema.parse(JSON.parse(bytes.toString("utf8")));
	const root = await realpath(dirname(path));
	for (const probe of Object.values(proof.probes)) {
		const evidencePath = join(root, probe.evidence.path);
		if ((await realpath(evidencePath)) !== evidencePath || !(await lstat(evidencePath)).isFile()) {
			throw new Error("qualification_evidence_not_regular");
		}
		const evidence = await readFile(evidencePath);
		if (
			evidence.byteLength !== probe.evidence.sizeBytes ||
			createHash("sha256").update(evidence).digest("hex") !== probe.evidence.sha256
		) {
			throw new Error("qualification_evidence_mismatch");
		}
	}
	return proof;
}
