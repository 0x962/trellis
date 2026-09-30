import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocolDigest } from "../../../../langflowContracts";
import { LangflowHostControl } from "../../../hostControl";
import type { OciRun } from "../../../ociDriver/process/process";
import { EngineDestinationEvidenceSchema, type EngineInstallIntent } from "../../contracts";
import { engineRestoreScript } from "../helper";

export async function runEngineRestoreHelper(
	run: OciRun,
	input: { intent: EngineInstallIntent; intentBytes: string; payload: string; mode: "install" | "verify" },
) {
	const { intent, intentBytes, payload, mode } = input;
	const intentDigest = protocolDigest(intentBytes);
	const paths = {
		intent: join(LangflowHostControl.directory(intent.identity.home), "restored-engine", `${intentDigest}.json`),
		database: join(payload, "engine", "database.sqlite"),
		secret: join(payload, "secrets", "engine-secret"),
	};
	for (const path of Object.values(paths)) {
		const info = await lstat(path);
		if (path.includes(",") || path.includes("\n") || await realpath(path) !== path ||
			!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0)
			throw new Error("restored_engine_helper_input_unsafe");
	}
	const result = await run([
		"container", "run", "--rm", "--pull", "never", "--network", "none", "--read-only",
		"--user", "0:0", "--cap-drop", "ALL", "--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE",
		"--cap-add", "FOWNER", "--security-opt", "no-new-privileges", "--workdir", "/",
		...Object.entries(paths).flatMap(([name, path]) => ["--mount", `type=bind,src=${path},dst=/input/${name},readonly`]),
		"--mount", `type=volume,src=${intent.target.volumes.data},dst=/data,volume-nocopy${mode === "verify" ? ",readonly" : ""}`,
		"--mount", `type=volume,src=${intent.target.volumes.secrets},dst=/run/trellis-secrets,volume-nocopy${mode === "verify" ? ",readonly" : ""}`,
		"--entrypoint", "/usr/local/bin/python3.12", intent.package.imageConfigDigest, "-B", "-c", engineRestoreScript, mode,
	]);
	if (result.exitCode !== 0) throw new Error("restored_engine_helper_failed");
	const evidence = EngineDestinationEvidenceSchema.parse(JSON.parse(result.stdout));
	if (evidence.intentDigest !== intentDigest ||
		!isDeepStrictEqual(evidence.database, { ...intent.capture.database, uid: 10001, gid: 10001, mode: "0600" }) ||
		!isDeepStrictEqual(evidence.secret, { ...intent.capture.secret, uid: 10001, gid: 10001, mode: "0400" }) ||
		!isDeepStrictEqual(evidence.revisions, intent.capture.revisions) || !isDeepStrictEqual(evidence.tables, intent.capture.tables))
		throw new Error("restored_engine_readback_conflict");
	return evidence;
}
