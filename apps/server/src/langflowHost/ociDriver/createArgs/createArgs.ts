import type { SidecarIdentity } from "../../contracts";
import {
	containerAuthenticationFile,
	containerCaptureIssuerFile,
	containerDataDirectory,
	containerEncryptionFile,
	containerEngineApiConfigFile,
	containerLabels,
	names,
} from "../identity/identity";

export function containerCreateArgs(input: {
	identity: SidecarIdentity;
	image: string;
	storage: { data: string; secrets: string };
	engineApiConfigDigest: string | null;
}) {
	const instanceNames = names(input.identity);
	return [
		"container",
		"create",
		"--pull",
		"never",
		"--name",
		instanceNames.container,
		"--network",
		instanceNames.network,
		"--read-only",
		"--user",
		"10001:10001",
		"--cap-drop",
		"ALL",
		"--security-opt",
		"no-new-privileges",
		"--tmpfs",
		"/tmp:rw,noexec,nosuid,nodev,mode=1777,size=64m",
		"--publish",
		"127.0.0.1::7860",
		"--mount",
		`type=volume,src=${input.storage.data},dst=${containerDataDirectory}`,
		"--mount",
		`type=volume,src=${input.storage.secrets},dst=/run/trellis-secrets,readonly`,
		...environment(input.identity, input.engineApiConfigDigest !== null),
		...Object.entries(containerLabels(input.identity, input.engineApiConfigDigest)).flatMap(([key, value]) => [
			"--label",
			`${key}=${value}`,
		]),
		input.image,
		"run",
		"--host",
		"0.0.0.0",
		"--port",
		"7860",
		"--workers",
		"1",
	];
}

function environment(identity: SidecarIdentity, engineApiConfig: boolean) {
	const values: Record<string, string> = {
		TRELLIS_AUTHENTICATION_FILE: containerAuthenticationFile,
		TRELLIS_CAPTURE_ISSUER_FILE: containerCaptureIssuerFile,
		LANGFLOW_SECRET_KEY_FILE: containerEncryptionFile,
		TRELLIS_DATA_HOME_ID: identity.dataHomeId,
		TRELLIS_HOST_ID: identity.hostId,
		TRELLIS_OWNER_ID: identity.ownerId,
		TRELLIS_INSTANCE_ID: identity.instanceId,
		TRELLIS_MANIFEST_DIGEST: identity.manifestDigest,
	};
	if (engineApiConfig) values.TRELLIS_ENGINE_API_CONFIG_FILE = containerEngineApiConfigFile;
	return Object.entries(values).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}
