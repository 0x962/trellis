import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SidecarIdentity } from "../../contracts";
import { missingOciObject, type OciRun } from "../process/process";

const storageLabelPrefix = "io.trellis.langflow.storage";

export const VolumeSchema = z
	.array(
		z.object({
			Name: z.string().min(1),
			Driver: z.literal("local"),
			Labels: z.record(z.string(), z.string()).nullable(),
		}),
	)
	.length(1);

export type VolumeInspection = z.infer<typeof VolumeSchema>[number];
export type VolumeKind = "data" | "secrets";
export type StorageNames = { data: string; secrets: string };
export type StorageIdentity = Pick<SidecarIdentity, "hostId" | "dataHomeId">;
export type StorageInspection = { state: "found"; value: VolumeInspection } | { state: "absent" | "unknown" };
export async function privateFile(path: string) {
	const metadata = await lstat(path);
	if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600) {
		throw new Error("unsafe_sidecar_secret");
	}
	return realpath(path);
}

export async function privateDirectory(path: string) {
	const metadata = await lstat(path);
	if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o700) {
		throw new Error("unsafe_sidecar_directory");
	}
	return realpath(path);
}

export function privateDirectorySync(path: string) {
	const metadata = lstatSync(path);
	if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o700) {
		throw new Error("unsafe_sidecar_directory");
	}
	return realpathSync(path);
}

export function storageNames(identity: StorageIdentity): StorageNames {
	const suffix = createHash("sha256").update(identity.dataHomeId).digest("hex").slice(0, 32);
	return {
		data: `trellis-langflow-data-${suffix}`,
		secrets: `trellis-langflow-secrets-${suffix}`,
	};
}

export function storageLabels(identity: StorageIdentity, privateRootDigest: string, kind: VolumeKind) {
	return {
		[`${storageLabelPrefix}.data-home-id`]: identity.dataHomeId,
		[`${storageLabelPrefix}.host-id`]: identity.hostId,
		[`${storageLabelPrefix}.private-root-digest`]: privateRootDigest,
		[`${storageLabelPrefix}.kind`]: kind,
	};
}

export async function inspectVolume(run: OciRun, name: string): Promise<StorageInspection> {
	const result = await run(["volume", "inspect", name]);
	if (missingOciObject(result)) return { state: "absent" };
	if (result.exitCode !== 0) return { state: "unknown" };
	const parsed = VolumeSchema.safeParse(JSON.parse(result.stdout));
	return parsed.success ? { state: "found", value: parsed.data[0]! } : { state: "unknown" };
}

export function assertVolume(
	volume: VolumeInspection,
	identity: StorageIdentity,
	privateRootDigest: string,
	kind: VolumeKind,
) {
	const expectedName = storageNames(identity)[kind];
	const expectedLabels = storageLabels(identity, privateRootDigest, kind);
	if (volume.Name !== expectedName || !isDeepStrictEqual(volume.Labels, expectedLabels)) {
		throw new Error("sidecar_volume_identity_conflict");
	}
}

export async function createVolume(
	run: OciRun,
	identity: StorageIdentity,
	privateRootDigest: string,
	kind: VolumeKind,
) {
	const name = storageNames(identity)[kind];
	const labels = storageLabels(identity, privateRootDigest, kind);
	const result = await run([
		"volume",
		"create",
		...Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]),
		name,
	]);
	const inspected = await inspectVolume(run, name);
	if (result.exitCode !== 0 && inspected.state !== "found") throw new Error("sidecar_volume_start_unknown");
	if (inspected.state !== "found") throw new Error("sidecar_volume_unknown");
	assertVolume(inspected.value, identity, privateRootDigest, kind);
}

export async function provisionStorage(
	run: OciRun,
	input: {
		image: string;
		authenticationFile: string;
		captureIssuerFile: string;
		engineApiConfigFile: string | null;
		nativeReservationAuthenticationFile: string;
		storage: StorageNames;
		preservedSecret?: { sha256: string; size: number };
	},
) {
	const result = await run([
		"container",
		"run",
		"--rm",
		"--pull",
		"never",
		"--network",
		"none",
		"--read-only",
		"--user",
		"0:0",
		"--cap-drop",
		"ALL",
		"--cap-add",
		"CHOWN",
		"--cap-add",
		"DAC_OVERRIDE",
		"--cap-add",
		"FOWNER",
		"--security-opt",
		"no-new-privileges",
		"--tmpfs",
		"/tmp:rw,noexec,nosuid,nodev,mode=1777,size=16m",
		"--mount",
		`type=bind,src=${input.authenticationFile},dst=/input/authentication,readonly`,
		"--mount",
		`type=bind,src=${input.captureIssuerFile},dst=/input/capture-issuer,readonly`,
		...(input.engineApiConfigFile
			? ["--mount", `type=bind,src=${input.engineApiConfigFile},dst=/input/engine-api,readonly`]
			: []),
		"--mount",
		`type=bind,src=${input.nativeReservationAuthenticationFile},dst=/input/native-reservations,readonly`,
		"--mount",
		`type=volume,src=${input.storage.data},dst=/engine`,
		"--mount",
		`type=volume,src=${input.storage.secrets},dst=/secrets`,
		"--entrypoint",
		"/bin/sh",
		input.image,
		"-c",
		storageProvisionScript(input.preservedSecret),
	]);
	if (result.exitCode !== 0) throw new Error("sidecar_storage_provision_failed");
}

const storageProvisionScript = (preservedSecret?: { sha256: string; size: number }) => [
	"set -eu",
	...(preservedSecret ? [verifyRestoredSecret(preservedSecret)] : []),
	"install -d -o 10001 -g 10001 -m 0700 /engine /engine/config /secrets",
	"install -o 10001 -g 10001 -m 0600 /input/authentication /secrets/authentication",
	"install -o 10001 -g 10001 -m 0600 /input/capture-issuer /secrets/capture-issuer",
	"if [ -e /input/engine-api ]; then",
	"install -o 10001 -g 10001 -m 0600 /input/engine-api /secrets/engine-api.json",
	"else",
	"rm -f /secrets/engine-api.json",
	"fi",
	"install -o 10001 -g 10001 -m 0600 /input/native-reservations /secrets/native-reservations.token",
	...(preservedSecret ? [verifyRestoredSecret(preservedSecret)] : [
	"if [ ! -s /secrets/engine-secret ]; then",
	"python -c 'from pathlib import Path; from secrets import token_urlsafe; Path(\"/secrets/engine-secret\").write_text(token_urlsafe(48))'",
	"chown 10001:10001 /secrets/engine-secret",
	"chmod 0400 /secrets/engine-secret",
	"fi",
	]),
].join("\n");

function verifyRestoredSecret(expected: { sha256: string; size: number }) {
	if (!/^[a-f0-9]{64}$/.test(expected.sha256) || !Number.isSafeInteger(expected.size) || expected.size <= 0)
		throw new Error("restored_secret_binding_invalid");
	const source = [
		"import os,stat,hashlib",
		"fd=os.open(\"/secrets/engine-secret\",os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)",
		"info=os.fstat(fd)",
		'if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:\n raise RuntimeError("restored_secret_unsafe")',
		'if (info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode))!=(10001,10001,0o400):\n raise RuntimeError("restored_secret_mode_conflict")',
		"digest=hashlib.sha256()",
		"size=0",
		"while chunk := os.read(fd,1024*1024):\n digest.update(chunk)\n size+=len(chunk)",
		`if digest.hexdigest()!="${expected.sha256}" or size!=${expected.size}:\n raise RuntimeError("restored_secret_bytes_changed")`,
		"os.close(fd)",
	].join("\n");
	return `python -I -B -c '${source}'`;
}
