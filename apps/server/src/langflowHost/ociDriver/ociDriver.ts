import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
	type LangflowSidecarManifestV1,
	LangflowSidecarManifestV1Schema,
} from "../../../../../integrations/langflow/package-probe/sidecarManifest";
import type { SidecarDriver, SidecarIdentity, SidecarObservation } from "../contracts";
import { containerCreateArgs } from "./createArgs/createArgs";
import {
	assertContainer,
	assertNetwork,
	endpoint,
	HealthSchema,
	inspectContainer,
	inspectNetwork,
	labels,
	names,
} from "./identity/identity";
import { type OciCommandResult, runOciCommand } from "./process/process";
import {
	assertVolume,
	createVolume,
	inspectVolume,
	privateDirectory,
	privateFile,
	provisionStorage,
	storageNames,
} from "./storage/storage";

export type OciDriverDependencies = {
	run(args: string[]): Promise<OciCommandResult>;
	fetch: typeof fetch;
};

export type OciDriverOptions = {
	manifest: LangflowSidecarManifestV1;
	imageConfigDigest: string;
	privateRoot: string;
	dockerExecutable?: string;
	dependencies?: Partial<OciDriverDependencies>;
};

export function createOciDriver(options: OciDriverOptions): SidecarDriver {
	const manifest = LangflowSidecarManifestV1Schema.parse(options.manifest);
	if (manifest.target.kind !== "linux-oci") throw new Error("sidecar_oci_target_required");
	if (!/^sha256:[0-9a-f]{64}$/.test(options.imageConfigDigest)) throw new Error("sidecar_image_config_invalid");
	const executable = options.dockerExecutable ?? "docker";
	const run = options.dependencies?.run ?? ((args: string[]) => runOciCommand(executable, args));
	const fetcher = options.dependencies?.fetch ?? fetch;
	const privateRoot = resolve(options.privateRoot);
	const privateRootDigest = createHash("sha256").update(privateRoot).digest("hex");
	const image = {
		reference: `${manifest.target.image}@${manifest.target.imageDigest}`,
		configDigest: options.imageConfigDigest,
	};

	async function assertIsolation(identity: SidecarIdentity) {
		const instanceNames = names(identity);
		const storage = storageNames(identity);
		const [network, data, secrets] = await Promise.all([
			inspectNetwork(run, instanceNames.network),
			inspectVolume(run, storage.data),
			inspectVolume(run, storage.secrets),
		]);
		if (network.state !== "found" || data.state !== "found" || secrets.state !== "found") {
			throw new Error("sidecar_isolation_unknown");
		}
		assertNetwork(network.value, identity);
		assertVolume(data.value, identity, privateRootDigest, "data");
		assertVolume(secrets.value, identity, privateRootDigest, "secrets");
		return storage;
	}

	async function inspectRetainedState(identity: SidecarIdentity) {
		const instanceNames = names(identity);
		const storage = storageNames(identity);
		const [network, data, secrets] = await Promise.all([
			inspectNetwork(run, instanceNames.network),
			inspectVolume(run, storage.data),
			inspectVolume(run, storage.secrets),
		]);
		if (network.state === "unknown" || data.state === "unknown" || secrets.state === "unknown") {
			throw new Error("sidecar_isolation_unknown");
		}
		if (network.state === "found") assertNetwork(network.value, identity);
		if (data.state === "found") assertVolume(data.value, identity, privateRootDigest, "data");
		if (secrets.state === "found") assertVolume(secrets.value, identity, privateRootDigest, "secrets");
		return network;
	}

	async function start(input: Parameters<SidecarDriver["start"]>[0]) {
		if (!isDeepStrictEqual(input.manifest, manifest)) throw new Error("sidecar_manifest_conflict");
		const identityLabels = labels(input.identity);
		const instanceNames = names(input.identity);
		const data = await privateDirectory(input.dataDirectory);
		const authentication = await privateFile(input.authenticationFile);
		if (data !== join(privateRoot, "data")) throw new Error("sidecar_data_directory_conflict");
		if (authentication !== join(privateRoot, "secrets", `${input.identity.instanceId}.token`)) {
			throw new Error("sidecar_authentication_file_conflict");
		}
		let container = await inspectContainer(run, instanceNames.container);
		if (container.state === "unknown") throw new Error("sidecar_ownership_unknown");
		if (container.state === "found") {
			const storage = await assertIsolation(input.identity);
			assertContainer(container.value, input.identity, image, storage);
		} else {
			let network = await inspectNetwork(run, instanceNames.network);
			if (network.state === "unknown") throw new Error("sidecar_network_unknown");
			if (network.state === "absent") {
				const result = await run([
					"network",
					"create",
					"--driver",
					"bridge",
					"--internal",
					...Object.entries(identityLabels).flatMap(([key, value]) => ["--label", `${key}=${value}`]),
					instanceNames.network,
				]);
				network = await inspectNetwork(run, instanceNames.network);
				if (result.exitCode !== 0 && network.state !== "found") throw new Error("sidecar_network_start_unknown");
			}
			if (network.state !== "found") throw new Error("sidecar_network_unknown");
			assertNetwork(network.value, input.identity);
			const storage = storageNames(input.identity);
			for (const kind of ["data", "secrets"] as const) {
				const volume = await inspectVolume(run, storage[kind]);
				if (volume.state === "unknown") throw new Error("sidecar_volume_unknown");
				if (volume.state === "absent") await createVolume(run, input.identity, privateRootDigest, kind);
				else assertVolume(volume.value, input.identity, privateRootDigest, kind);
			}
			await provisionStorage(run, { image: image.reference, authenticationFile: authentication, storage });
			const result = await run(containerCreateArgs({ identity: input.identity, image: image.reference, storage }));
			container = await inspectContainer(run, instanceNames.container);
			if (result.exitCode !== 0 && container.state !== "found") throw new Error("sidecar_start_unknown");
		}
		if (container.state !== "found") throw new Error("sidecar_ownership_unknown");
		let storage = await assertIsolation(input.identity);
		assertContainer(container.value, input.identity, image, storage);
		if (!container.value.State.Running) {
			const result = await run(["container", "start", container.value.Id]);
			container = await inspectContainer(run, instanceNames.container);
			if (result.exitCode !== 0 && container.state !== "found") throw new Error("sidecar_start_unknown");
		}
		if (container.state !== "found" || !container.value.State.Running) throw new Error("sidecar_start_unconfirmed");
		storage = await assertIsolation(input.identity);
		assertContainer(container.value, input.identity, image, storage);
		endpoint(container.value);
	}

	async function observe(input: Parameters<SidecarDriver["observe"]>[0]): Promise<SidecarObservation> {
		const name = names(input.identity).container;
		const inspected = await inspectContainer(run, name);
		if (inspected.state !== "found") {
			if (inspected.state === "absent") {
				try {
					await inspectRetainedState(input.identity);
				} catch {
					return {
						identity: input.identity,
						challenge: input.challenge,
						state: "unknown",
						health: "unknown",
						endpoint: null,
					};
				}
			}
			return {
				identity: input.identity,
				challenge: input.challenge,
				state: inspected.state,
				health: "unknown",
				endpoint: null,
			};
		}
		let authentication: string;
		try {
			authentication = await privateFile(input.authenticationFile);
			if (authentication !== join(privateRoot, "secrets", `${input.identity.instanceId}.token`)) {
				throw new Error("sidecar_authentication_file_conflict");
			}
			const storage = await assertIsolation(input.identity);
			assertContainer(inspected.value, input.identity, image, storage);
		} catch {
			return {
				identity: input.identity,
				challenge: input.challenge,
				state: "unknown",
				health: "unknown",
				endpoint: null,
			};
		}
		if (!inspected.value.State.Running) {
			return {
				identity: input.identity,
				challenge: input.challenge,
				state: "exited",
				health: "unknown",
				endpoint: null,
			};
		}
		const origin = endpoint(inspected.value);
		const token = await readFile(authentication, "utf8");
		const url = new URL("/trellis-v1/health", origin);
		url.searchParams.set("challenge", input.challenge);
		let response: Response;
		try {
			response = await fetcher(url, {
				headers: {
					Authorization: `Bearer ${token}`,
					"Cache-Control": "no-store",
					"X-Trellis-Challenge": input.challenge,
				},
				redirect: "error",
				signal: AbortSignal.timeout(manifest.health.requestTimeoutMs),
			});
		} catch {
			return {
				identity: input.identity,
				challenge: input.challenge,
				state: "running",
				health: "unknown",
				endpoint: origin,
			};
		}
		let health: ReturnType<typeof HealthSchema.safeParse>;
		try {
			health = HealthSchema.safeParse(await response.json());
		} catch {
			return {
				identity: input.identity,
				challenge: input.challenge,
				state: "running",
				health: "unhealthy",
				endpoint: origin,
			};
		}
		return {
			identity: input.identity,
			challenge: input.challenge,
			state: "running",
			health:
				response.status === manifest.health.expectedStatus &&
				health.success &&
				health.data.challenge === input.challenge &&
				isDeepStrictEqual(health.data.identity, input.identity)
					? "healthy"
					: "unhealthy",
			endpoint: origin,
		};
	}

	async function stop(identity: SidecarIdentity) {
		const instanceNames = names(identity);
		let container = await inspectContainer(run, instanceNames.container);
		if (container.state === "absent") {
			const network = await inspectRetainedState(identity);
			if (network.state === "found") {
				await run(["network", "rm", network.value.Id]);
				if ((await inspectNetwork(run, instanceNames.network)).state !== "absent") {
					throw new Error("sidecar_network_remove_unconfirmed");
				}
			}
			return;
		}
		if (container.state !== "found") throw new Error("sidecar_ownership_unknown");
		let storage = await assertIsolation(identity);
		assertContainer(container.value, identity, image, storage);
		if (container.value.State.Running) {
			await run(["container", "stop", container.value.Id]);
			container = await inspectContainer(run, instanceNames.container);
		}
		if (container.state !== "found" || container.value.State.Running) throw new Error("sidecar_stop_unconfirmed");
		storage = await assertIsolation(identity);
		assertContainer(container.value, identity, image, storage);
		await run(["container", "rm", container.value.Id]);
		container = await inspectContainer(run, instanceNames.container);
		if (container.state !== "absent") throw new Error("sidecar_remove_unconfirmed");
		const network = await inspectNetwork(run, instanceNames.network);
		if (network.state === "found") {
			assertNetwork(network.value, identity);
			await run(["network", "rm", network.value.Id]);
			if ((await inspectNetwork(run, instanceNames.network)).state !== "absent") {
				throw new Error("sidecar_network_remove_unconfirmed");
			}
		}
		if (network.state === "unknown") throw new Error("sidecar_network_unknown");
	}

	return { start, observe, stop };
}
