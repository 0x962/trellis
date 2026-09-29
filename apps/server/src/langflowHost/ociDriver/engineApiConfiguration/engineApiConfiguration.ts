import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { privateFile } from "../storage/storage";

export function engineApiConfiguration(input: {
	engineApiConfigFile?: string;
	engineApiConfigSha256?: string;
	nativeReservationAuthenticationFile?: string;
}) {
	const configured = [
		input.engineApiConfigFile,
		input.engineApiConfigSha256,
		input.nativeReservationAuthenticationFile,
	].filter((value) => value !== undefined).length;
	if (configured !== 0 && configured !== 3) throw new Error("sidecar_engine_api_configuration_incomplete");
	if (input.engineApiConfigSha256 && !/^[0-9a-f]{64}$/.test(input.engineApiConfigSha256)) {
		throw new Error("sidecar_engine_api_config_digest_invalid");
	}

	return async () => {
		if (
			!input.engineApiConfigFile ||
			!input.engineApiConfigSha256 ||
			!input.nativeReservationAuthenticationFile
		) {
			return { path: null, digest: null, nativeReservationAuthenticationFile: null };
		}
		const path = await privateFile(input.engineApiConfigFile);
		const nativeReservationAuthenticationFile = await privateFile(input.nativeReservationAuthenticationFile);
		const digest = createHash("sha256")
			.update(await readFile(path))
			.digest("hex");
		if (digest !== input.engineApiConfigSha256) throw new Error("sidecar_engine_api_config_digest_conflict");
		return { path, digest, nativeReservationAuthenticationFile };
	};
}
