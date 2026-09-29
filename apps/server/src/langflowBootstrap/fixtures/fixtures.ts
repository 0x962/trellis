import type { CandidatePackage } from "../../../../../integrations/langflow/release";
import { loadConfig } from "../../config";
import type { AuthorityPort, HostControlIdentity, LiveOwnership, SidecarDriver } from "../../langflowHost";
import { manifest as baseManifest } from "../../langflowHost/fixtures/manifest";
import type { LangflowBootstrapDependencies } from "../compose";
import type { LangflowBootstrapConfiguration } from "../configuration";

export function bootstrapFixture() {
	const calls: string[] = [];
	const digest = "a".repeat(64);
	const identity: HostControlIdentity = {
		version: 1,
		home: "/isolated/trellis",
		hostId: "00000000-0000-4000-8000-000000000001",
		dataHomeId: "00000000-0000-4000-8000-000000000002",
	};
	const manifest = structuredClone(baseManifest);
	manifest.data.dataHomeId = identity.dataHomeId;
	manifest.epochOwnership.dataHomeId = identity.dataHomeId;
	const candidate: CandidatePackage = {
		qualification: "candidate",
		enginePackageDigest: digest,
		componentManifestHash: digest,
		componentManifestPath: "/sealed/components.json",
		engineOverlayHash: digest,
		targetArchitecture: "arm64",
		engine: {
			layoutDirectory: "/sealed/oci-layout",
			image: "fixture",
			imageDigest: `sha256:${digest}`,
			imageConfigDigest: `sha256:${digest}`,
		},
		editor: { rootDirectory: "/sealed/editor" },
		frontendTemplates: { path: "/sealed/templates.json", sha256: digest, engineOverlayHash: digest },
		manifestPath: "/sealed/package.json",
	};
	const configuration: LangflowBootstrapConfiguration = {
		version: 1,
		packageRoot: "/sealed",
		packageId: digest,
		qualificationFile: "/accepted/qualification.json",
		qualificationSha256: digest,
		runtime: {
			data: { ...manifest.data, privateRoot: "data" },
			encryptionSecret: { ...manifest.encryptionSecret, relativePath: "run/trellis-secrets/engine-secret" },
			health: { ...manifest.health, path: "/trellis-v1/health" },
			epochOwnership: manifest.epochOwnership,
		},
		expectedHostId: identity.hostId,
		expectedDataHomeId: identity.dataHomeId,
		parentOrigin: "http://127.0.0.1:4521",
		editorOrigin: "http://127.0.0.1:7860",
		engineApiConfigFile: "/private/engine.json",
		captureIssuerFile: "/private/capture.key",
		nativeReservationAuthenticationFile: "/private/native.key",
	};
	const forbidden = async (): Promise<never> => { throw new Error("unexpected_authority_operation"); };
	const authority: AuthorityPort = {
		revokeOwner: forbidden, readRevocation: forbidden, readReceipt: forbidden, read: forbidden, commit: forbidden,
	};
	const driver: SidecarDriver = { start: forbidden, observe: forbidden, stop: forbidden };
	const observation: LiveOwnership = {
		id: "observed",
		identity: { ...identity, ownerId: "owner", instanceId: "instance", manifestDigest: digest },
		observedAt: "2026-09-29T00:00:00.000Z",
		endpoint: configuration.editorOrigin,
	};
	const dependencies: LangflowBootstrapDependencies = {
		readConfiguration: async () => { calls.push("configuration"); return configuration; },
		readIdentity: () => { calls.push("identity"); return identity; },
		qualify: async () => {
			calls.push("qualification");
			return { candidate, manifest, qualificationSha256: digest };
		},
		engineConfiguration: async () => { calls.push("engine-configuration"); return { sha256: digest }; },
		installedManifest: async () => {
			calls.push("manifest");
			return { hash: digest, publicManifest: { blockers: ["fixture"] }, assertContent: async () => {} };
		},
		importImage: async () => { calls.push("import"); return { imageConfigDigest: candidate.engine.imageConfigDigest }; },
		driver: () => { calls.push("driver"); return driver; },
		authority: () => { calls.push("authority"); return authority; },
		openSupervisor: async () => {
			calls.push("supervisor");
			return {
				start: async () => { calls.push("start"); return observation; },
				shutdown: async () => { calls.push("shutdown"); },
			};
		},
	};
	const config = loadConfig({
		TRELLIS_HOME: identity.home,
		TRELLIS_AUTH_TOKEN: "fixture-host-token",
		TRELLIS_LANGFLOW_CONFIG_FILE: "/private/langflow.json",
	});
	return { calls, config, configuration, dependencies, candidate, manifest, identity };
}
