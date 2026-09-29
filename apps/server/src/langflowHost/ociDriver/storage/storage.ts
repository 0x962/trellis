import { createHash } from "node:crypto";
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

export function storageNames(identity: SidecarIdentity): StorageNames {
	const suffix = createHash("sha256").update(identity.dataHomeId).digest("hex").slice(0, 32);
	return {
		data: `trellis-langflow-data-${suffix}`,
		secrets: `trellis-langflow-secrets-${suffix}`,
	};
}

export function storageLabels(identity: SidecarIdentity, privateRootDigest: string, kind: VolumeKind) {
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
	identity: SidecarIdentity,
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
	identity: SidecarIdentity,
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
		storage: StorageNames;
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
		"--mount",
		`type=volume,src=${input.storage.data},dst=/engine`,
		"--mount",
		`type=volume,src=${input.storage.secrets},dst=/secrets`,
		"--entrypoint",
		"/bin/sh",
		input.image,
		"-c",
		storageProvisionScript,
	]);
	if (result.exitCode !== 0) throw new Error("sidecar_storage_provision_failed");
}

const storageProvisionScript = [
	"set -eu",
	"install -d -o 10001 -g 10001 -m 0700 /engine /engine/config /secrets",
	"install -o 10001 -g 10001 -m 0600 /input/authentication /secrets/authentication",
	"install -o 10001 -g 10001 -m 0400 /input/capture-issuer /secrets/capture-issuer",
	"if [ ! -s /secrets/engine-secret ]; then",
	"python -c 'from pathlib import Path; from secrets import token_urlsafe; Path(\"/secrets/engine-secret\").write_text(token_urlsafe(48))'",
	"chown 10001:10001 /secrets/engine-secret",
	"chmod 0400 /secrets/engine-secret",
	"fi",
].join("\n");
