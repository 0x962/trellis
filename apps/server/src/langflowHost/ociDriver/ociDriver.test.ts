import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SidecarIdentity } from "../contracts";
import { manifest } from "../fixtures/manifest";
import { createOciDriver } from "./ociDriver";
import type { OciCommandResult } from "./process/process";
import { storageLabels, storageNames, type VolumeInspection } from "./storage/storage";

const configDigest = `sha256:${"b".repeat(64)}`;
const engineApiConfigContent = '{"version":1}';
const engineApiConfigDigest = createHash("sha256").update(engineApiConfigContent).digest("hex");
const identity: SidecarIdentity = {
	dataHomeId: "data-home-a",
	hostId: "host-1",
	ownerId: "owner-1",
	instanceId: "00000000-0000-4000-8000-000000000001",
	manifestDigest: "c".repeat(64),
};

test("the driver launches and verifies one restricted OCI instance", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-oci-driver-"));
	const data = join(root, "data");
	const authentication = join(root, "secrets", `${identity.instanceId}.token`);
	const captureIssuer = join(root, "capture-issuer.key");
	const engineApiConfig = join(root, "engine-api.json");
	await mkdir(join(root, "secrets"), { recursive: true, mode: 0o700 });
	await mkdir(data, { recursive: true, mode: 0o700 });
	await chmod(data, 0o700);
	await writeFile(authentication, "exact-private-bearer", { mode: 0o600 });
	await writeFile(captureIssuer, "exact-capture-issuer", { mode: 0o600 });
	await writeFile(engineApiConfig, engineApiConfigContent, { mode: 0o600 });
	let network = false;
	const volumes = new Map<string, VolumeInspection>();
	let container: ReturnType<typeof containerInspection> | null = null;
	const commands: string[][] = [];
	const run = async (args: string[]): Promise<OciCommandResult> => {
		commands.push(args);
		if (args[0] === "network" && args[1] === "inspect") {
			return network ? result([networkInspection()]) : missing("network");
		}
		if (args[0] === "network" && args[1] === "create") {
			network = true;
			return result("");
		}
		if (args[0] === "network" && args[1] === "rm") {
			network = false;
			return result("");
		}
		if (args[0] === "volume" && args[1] === "inspect") {
			const volume = volumes.get(args[2]!);
			return volume ? result([volume]) : missing("volume");
		}
		if (args[0] === "volume" && args[1] === "create") {
			const name = args.at(-1)!;
			const kind = name.includes("-data-") ? "data" : "secrets";
			volumes.set(name, volumeInspection(root, kind));
			return result(name);
		}
		if (args[0] === "container" && args[1] === "inspect") {
			return container ? result([container]) : missing("container");
		}
		if (args[0] === "container" && args[1] === "run") return result("");
		if (args[0] === "container" && args[1] === "create") {
			container = containerInspection(false);
			return result("");
		}
		if (args[0] === "container" && args[1] === "start") {
			container = containerInspection(true);
			return result("");
		}
		if (args[0] === "container" && args[1] === "stop") {
			container = containerInspection(false);
			return result("");
		}
		if (args[0] === "container" && args[1] === "rm") {
			container = null;
			return result("");
		}
		throw new Error(`unexpected command: ${args.join(" ")}`);
	};
	const driver = createOciDriver({
		manifest,
		imageConfigDigest: configDigest,
		privateRoot: root,
		captureIssuerFile: captureIssuer,
		engineApiConfigFile: engineApiConfig,
		dependencies: {
			run,
			fetch: async (input, init) => {
				const request = new Request(input, init);
				expect(request.url).toBe(
					"http://127.0.0.1:49152/trellis-v1/health?challenge=00000000-0000-4000-8000-000000000002",
				);
				expect(request.headers.get("Authorization")).toBe("Bearer exact-private-bearer");
				return Response.json({ status: "healthy", challenge: request.headers.get("X-Trellis-Challenge"), identity });
			},
		},
	});
	try {
		await driver.start({ identity, manifest, dataDirectory: data, authenticationFile: authentication });
		const create = commands.find((args) => args[0] === "container" && args[1] === "create")!;
		expect(create).toContain("--read-only");
		expect(create.slice(create.indexOf("--pull"), create.indexOf("--pull") + 2)).toEqual(["--pull", "never"]);
		expect(create.slice(create.indexOf("--user"), create.indexOf("--user") + 2)).toEqual(["--user", "10001:10001"]);
		expect(create).toContain("ALL");
		expect(create).toContain("no-new-privileges");
		expect(create).toContain("/tmp:rw,noexec,nosuid,nodev,mode=1777,size=64m");
		expect(create).toContain("127.0.0.1::7860");
		expect(create).toContain(`io.trellis.langflow.engine-api-config-digest=${engineApiConfigDigest}`);
		expect(create).not.toContain("--privileged");
		const provision = commands.find((args) => args[0] === "container" && args[1] === "run")!;
		expect(provision.slice(provision.indexOf("--pull"), provision.indexOf("--pull") + 2)).toEqual(["--pull", "never"]);
		expect(provision).toContain(configDigest);
		expect(provision.at(-1)).toContain("-m 0600 /input/authentication /secrets/authentication");
		expect(provision).toContain(`type=bind,src=${captureIssuer},dst=/input/capture-issuer,readonly`);
		expect(provision.at(-1)).toContain("-m 0600 /input/capture-issuer /secrets/capture-issuer");
		expect(provision).toContain(`type=bind,src=${engineApiConfig},dst=/input/engine-api,readonly`);
		expect(provision.at(-1)).toContain("-m 0600 /input/engine-api /secrets/engine-api.json");
		const observation = await driver.observe({
			identity,
			challenge: "00000000-0000-4000-8000-000000000002",
			authenticationFile: authentication,
		});
		expect(observation).toEqual({
			identity,
			challenge: "00000000-0000-4000-8000-000000000002",
			state: "running",
			health: "healthy",
			endpoint: "http://127.0.0.1:49152",
		});
		await driver.stop(identity);
		expect(container).toBeNull();
		expect(network).toBeFalse();
		const dataVolumeName = storageNames(identity).data;
		volumes.set(dataVolumeName, { ...volumes.get(dataVolumeName)!, Labels: {} });
		expect(
			await driver.observe({
				identity,
				challenge: "00000000-0000-4000-8000-000000000003",
				authenticationFile: authentication,
			}),
		).toMatchObject({ state: "unknown", health: "unknown", endpoint: null });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function result(output: unknown): OciCommandResult {
	return { exitCode: 0, stdout: typeof output === "string" ? output : JSON.stringify(output), stderr: "" };
}

function missing(kind: string): OciCommandResult {
	return { exitCode: 1, stdout: "", stderr: `No such ${kind}` };
}

function networkInspection() {
	return {
		Id: "network-id",
		Name: `trellis-langflow-${identity.instanceId}`,
		Driver: "bridge",
		Internal: true,
		Labels: labels(),
	};
}

function containerInspection(running: boolean) {
	const storage = storageNames(identity);
	return {
		Id: "container-id",
		Name: `/trellis-langflow-${identity.instanceId}`,
		Image: configDigest,
		Config: {
			Image: configDigest,
			User: "10001:10001",
			Env: [
				"TRELLIS_AUTHENTICATION_FILE=/run/trellis-secrets/authentication",
				"TRELLIS_CAPTURE_ISSUER_FILE=/run/trellis-secrets/capture-issuer",
				"TRELLIS_ENGINE_API_CONFIG_FILE=/run/trellis-secrets/engine-api.json",
				"LANGFLOW_SECRET_KEY_FILE=/run/trellis-secrets/engine-secret",
				`TRELLIS_DATA_HOME_ID=${identity.dataHomeId}`,
				`TRELLIS_HOST_ID=${identity.hostId}`,
				`TRELLIS_OWNER_ID=${identity.ownerId}`,
				`TRELLIS_INSTANCE_ID=${identity.instanceId}`,
				`TRELLIS_MANIFEST_DIGEST=${identity.manifestDigest}`,
			],
			Labels: {
				...labels(),
				"io.trellis.langflow.engine-api-config-digest": engineApiConfigDigest,
			},
		},
		HostConfig: {
			ReadonlyRootfs: true,
			NetworkMode: `trellis-langflow-${identity.instanceId}`,
			CapDrop: ["ALL"],
			SecurityOpt: ["no-new-privileges"],
			Privileged: false,
			PidMode: "",
			IpcMode: "private",
			UTSMode: "",
			Devices: [],
			Tmpfs: { "/tmp": "rw,noexec,nosuid,nodev,mode=1777,size=64m" },
		},
		Mounts: [
			{ Type: "volume", Name: storage.data, Source: "/docker/data", Destination: "/data", RW: true },
			{
				Type: "volume",
				Name: storage.secrets,
				Source: "/docker/secrets",
				Destination: "/run/trellis-secrets",
				RW: false,
			},
		],
		State: { Status: running ? "running" : "created", Running: running },
		NetworkSettings: { Ports: { "7860/tcp": [{ HostIp: "127.0.0.1", HostPort: "49152" }] } },
	};
}

function volumeInspection(root: string, kind: "data" | "secrets"): VolumeInspection {
	return {
		Name: storageNames(identity)[kind],
		Driver: "local",
		Labels: storageLabels(identity, createHash("sha256").update(root).digest("hex"), kind),
	};
}

function labels() {
	return {
		"io.trellis.langflow.data-home-id": identity.dataHomeId,
		"io.trellis.langflow.host-id": identity.hostId,
		"io.trellis.langflow.owner-id": identity.ownerId,
		"io.trellis.langflow.instance-id": identity.instanceId,
		"io.trellis.langflow.manifest-digest": identity.manifestDigest,
	};
}
