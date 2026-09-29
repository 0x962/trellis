import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SidecarIdentity } from "../../contracts";
import { missingOciObject, type OciRun } from "../process/process";

const labelPrefix = "io.trellis.langflow";
const engineApiConfigLabel = `${labelPrefix}.engine-api-config-digest`;
export const containerPort = "7860/tcp";
export const containerAuthenticationFile = "/run/trellis-secrets/authentication";
export const containerCaptureIssuerFile = "/run/trellis-secrets/capture-issuer";
export const containerEngineApiConfigFile = "/run/trellis-secrets/engine-api.json";
export const containerEncryptionFile = "/run/trellis-secrets/engine-secret";
export const containerNativeReservationAuthenticationFile =
	"/run/trellis-secrets/native-reservations.token";

export const HealthSchema = z.strictObject({
	status: z.literal("healthy"),
	challenge: z.string().uuid(),
	identity: z.strictObject({
		dataHomeId: z.string().min(1),
		hostId: z.string().min(1),
		ownerId: z.string().min(1),
		instanceId: z.string().uuid(),
		manifestDigest: z.string().regex(/^[0-9a-f]{64}$/),
	}),
});

export const NetworkSchema = z
	.array(
		z.object({
			Id: z.string().min(1),
			Name: z.string().min(1),
			Driver: z.literal("bridge"),
			Internal: z.literal(true),
			Labels: z.record(z.string(), z.string()).nullable(),
		}),
	)
	.length(1);

export const ContainerSchema = z
	.array(
		z.object({
			Id: z.string().min(1),
			Name: z.string().min(1),
			Image: z.string().min(1),
			Config: z.object({
				Image: z.string().min(1),
				User: z.literal("10001:10001"),
				Env: z.array(z.string()),
				Labels: z.record(z.string(), z.string()).nullable(),
			}),
			HostConfig: z.object({
				ReadonlyRootfs: z.literal(true),
				NetworkMode: z.string().min(1),
				CapDrop: z.array(z.string()).nullable(),
				SecurityOpt: z.array(z.string()).nullable(),
				Privileged: z.literal(false),
				PidMode: z.literal(""),
				IpcMode: z.literal("private"),
				UTSMode: z.literal(""),
				Devices: z.array(z.never()).nullable(),
				Tmpfs: z.record(z.string(), z.string()).nullable(),
			}),
			Mounts: z.array(
				z.object({
					Type: z.literal("volume"),
					Name: z.string().min(1),
					Source: z.string().min(1),
					Destination: z.string().min(1),
					RW: z.boolean(),
				}),
			),
			State: z.object({ Status: z.string().min(1), Running: z.boolean() }),
			NetworkSettings: z.object({
				Ports: z.record(
					z.string(),
					z.array(z.object({ HostIp: z.string(), HostPort: z.string().regex(/^[1-9][0-9]*$/) })).nullable(),
				),
			}),
		}),
	)
	.length(1);

export type NetworkInspection = z.infer<typeof NetworkSchema>[number];
export type ContainerInspection = z.infer<typeof ContainerSchema>[number];
export type Inspection<T> = { state: "found"; value: T } | { state: "absent" | "unknown" };

export async function inspectNetwork(run: OciRun, name: string): Promise<Inspection<NetworkInspection>> {
	const result = await run(["network", "inspect", name]);
	if (missingOciObject(result)) return { state: "absent" };
	if (result.exitCode !== 0) return { state: "unknown" };
	const parsed = NetworkSchema.safeParse(JSON.parse(result.stdout));
	return parsed.success ? { state: "found", value: parsed.data[0]! } : { state: "unknown" };
}

export async function inspectContainer(run: OciRun, name: string): Promise<Inspection<ContainerInspection>> {
	const result = await run(["container", "inspect", name]);
	if (missingOciObject(result)) return { state: "absent" };
	if (result.exitCode !== 0) return { state: "unknown" };
	const parsed = ContainerSchema.safeParse(JSON.parse(result.stdout));
	return parsed.success ? { state: "found", value: parsed.data[0]! } : { state: "unknown" };
}

export function names(identity: SidecarIdentity) {
	const suffix = identity.instanceId.toLowerCase();
	return { container: `trellis-langflow-${suffix}`, network: `trellis-langflow-${suffix}` };
}

export function labels(identity: SidecarIdentity) {
	return {
		[`${labelPrefix}.data-home-id`]: identity.dataHomeId,
		[`${labelPrefix}.host-id`]: identity.hostId,
		[`${labelPrefix}.owner-id`]: identity.ownerId,
		[`${labelPrefix}.instance-id`]: identity.instanceId,
		[`${labelPrefix}.manifest-digest`]: identity.manifestDigest,
	};
}

export function containerLabels(identity: SidecarIdentity, engineApiConfigDigest: string | null) {
	return engineApiConfigDigest
		? { ...labels(identity), [engineApiConfigLabel]: engineApiConfigDigest }
		: labels(identity);
}

export function assertNetwork(network: NetworkInspection, identity: SidecarIdentity) {
	if (!isDeepStrictEqual(network.Labels, labels(identity))) throw new Error("sidecar_network_identity_conflict");
}

export function assertContainer(
	container: ContainerInspection,
	identity: SidecarIdentity,
	image: { reference: string; configDigest: string },
	storage?: { data: string; secrets: string },
	engineApiConfigDigest: string | null = null,
) {
	const expectedNames = names(identity);
	const tmpfsOptions = new Set(container.HostConfig.Tmpfs?.["/tmp"]?.split(","));
	const tmpfsSize = tmpfsOptions.has("size=64m") || tmpfsOptions.has("size=67108864");
	const tmpfsMode = tmpfsOptions.has("mode=01777") || tmpfsOptions.has("mode=1777");
	if (
		container.Name !== `/${expectedNames.container}` ||
		container.Config.Image !== image.reference ||
		container.Image !== image.configDigest ||
		!isDeepStrictEqual(container.Config.Labels, containerLabels(identity, engineApiConfigDigest)) ||
		container.HostConfig.NetworkMode !== expectedNames.network ||
		!container.HostConfig.CapDrop?.includes("ALL") ||
		!container.HostConfig.SecurityOpt?.includes("no-new-privileges") ||
		container.HostConfig.SecurityOpt?.some((value) => value.includes("seccomp=unconfined")) ||
		!tmpfsOptions.has("rw") ||
		!tmpfsOptions.has("noexec") ||
		!tmpfsOptions.has("nosuid") ||
		!tmpfsOptions.has("nodev") ||
		!tmpfsSize ||
		!tmpfsMode ||
		!container.Config.Env.includes(`TRELLIS_AUTHENTICATION_FILE=${containerAuthenticationFile}`) ||
		!container.Config.Env.includes(`TRELLIS_CAPTURE_ISSUER_FILE=${containerCaptureIssuerFile}`) ||
		container.Config.Env.includes(`TRELLIS_ENGINE_API_CONFIG_FILE=${containerEngineApiConfigFile}`) !==
			(engineApiConfigDigest !== null) ||
		!container.Config.Env.includes(`LANGFLOW_SECRET_KEY_FILE=${containerEncryptionFile}`) ||
		!container.Config.Env.includes(`TRELLIS_DATA_HOME_ID=${identity.dataHomeId}`) ||
		!container.Config.Env.includes(`TRELLIS_HOST_ID=${identity.hostId}`) ||
		!container.Config.Env.includes(`TRELLIS_OWNER_ID=${identity.ownerId}`) ||
		!container.Config.Env.includes(`TRELLIS_INSTANCE_ID=${identity.instanceId}`) ||
		!container.Config.Env.includes(`TRELLIS_MANIFEST_DIGEST=${identity.manifestDigest}`)
	)
		throw new Error("sidecar_container_identity_conflict");
	if (!storage) return;
	const expectedMounts = [
		{ Name: storage.data, Destination: "/data", RW: true },
		{ Name: storage.secrets, Destination: "/run/trellis-secrets", RW: false },
	];
	if (container.Mounts.length !== expectedMounts.length) throw new Error("sidecar_mount_conflict");
	for (const expected of expectedMounts) {
		const actual = container.Mounts.find((item) => item.Destination === expected.Destination);
		if (!actual || !isDeepStrictEqual({ Name: actual.Name, Destination: actual.Destination, RW: actual.RW }, expected))
			throw new Error("sidecar_mount_conflict");
	}
}

export function endpoint(container: ContainerInspection) {
	const bindings = container.NetworkSettings.Ports[containerPort];
	if (bindings?.length !== 1 || bindings[0]!.HostIp !== "127.0.0.1") {
		throw new Error("sidecar_loopback_binding_missing");
	}
	return `http://127.0.0.1:${bindings[0]!.HostPort}`;
}
