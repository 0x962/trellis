import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SidecarIdentity } from "../../contracts";
import { privateFile } from "../storage/storage";

export async function nativeReservationAuthentication(input: {
	privateRoot: string;
	identity: SidecarIdentity;
	file: string;
	sha256: string;
}) {
	if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
		throw new Error("sidecar_native_reservation_authentication_digest_invalid");
	}
	const file = await privateFile(input.file);
	if (file !== join(input.privateRoot, "secrets", `${input.identity.instanceId}.native-reservations.token`)) {
		throw new Error("sidecar_native_reservation_authentication_file_conflict");
	}
	const digest = createHash("sha256")
		.update(await readFile(file))
		.digest("hex");
	if (digest !== input.sha256) throw new Error("sidecar_native_reservation_authentication_digest_conflict");
	return { file, digest };
}

export function nativeReservationAuthenticationReader(privateRoot: string) {
	return (input: {
		identity: SidecarIdentity;
		nativeReservationAuthenticationFile: string;
		nativeReservationAuthenticationSha256: string;
	}) =>
		nativeReservationAuthentication({
			privateRoot,
			identity: input.identity,
			file: input.nativeReservationAuthenticationFile,
			sha256: input.nativeReservationAuthenticationSha256,
		});
}
