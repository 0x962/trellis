import { posix } from "node:path";
import type { LangflowSidecarManifestV1 } from "../../../../../../integrations/langflow/package-probe/sidecarManifest";
import { containerDataDirectory, containerEncryptionFile } from "../identity/identity";

export function assertManifestRuntime(manifest: LangflowSidecarManifestV1) {
	if (posix.resolve("/", manifest.data.privateRoot) !== containerDataDirectory) {
		throw new Error("sidecar_data_manifest_conflict");
	}
	if (posix.resolve("/", manifest.encryptionSecret.relativePath) !== containerEncryptionFile) {
		throw new Error("sidecar_encryption_secret_manifest_conflict");
	}
	if (manifest.health.scheme !== "http" || manifest.health.host !== "127.0.0.1") {
		throw new Error("sidecar_health_manifest_conflict");
	}
}
