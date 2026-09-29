import { join } from "node:path";
import type { LangflowSidecarManifestV1 } from "../../../../../integrations/langflow/package-probe/sidecarManifest";
import type { CandidatePackage } from "../../../../../integrations/langflow/release";
import type { Config } from "../../config";
import type { EditorGatewayConfiguration } from "../../editorGateway";
import type {
	AuthorityPort,
	HostControlIdentity,
	LangflowSupervisor,
	OciDriverOptions,
	SidecarDriver,
	SupervisorDependencies,
} from "../../langflowHost";
import type { InstalledEditorManifest } from "../../services/langflowEditorSessions";
import type { LangflowBootstrapConfiguration } from "../configuration";

export type BootstrapSupervisor = Pick<LangflowSupervisor, "start" | "shutdown">;
export type LangflowBootstrapDependencies = {
	readConfiguration(path: string): Promise<LangflowBootstrapConfiguration>;
	readIdentity(home: string): HostControlIdentity;
	qualify(configuration: LangflowBootstrapConfiguration, identity: HostControlIdentity): Promise<{
		candidate: CandidatePackage;
		manifest: LangflowSidecarManifestV1;
		qualificationSha256: string;
	}>;
	engineConfiguration(
		path: string,
		qualified: { candidate: CandidatePackage; manifest: LangflowSidecarManifestV1 },
	): Promise<{ sha256: string }>;
	installedManifest(candidate: CandidatePackage): Promise<InstalledEditorManifest>;
	importImage(input: {
		candidate: CandidatePackage;
		manifest: LangflowSidecarManifestV1;
		qualificationSha256: string;
	}): Promise<{ imageConfigDigest: string }>;
	driver(options: OciDriverOptions): SidecarDriver;
	authority(identity: HostControlIdentity): AuthorityPort;
	openSupervisor(input: {
		home: string;
		hostId: string;
		manifest: LangflowSidecarManifestV1;
		dependencies: SupervisorDependencies;
	}): Promise<BootstrapSupervisor>;
};

export async function composeLangflowBootstrap(config: Config, deps: LangflowBootstrapDependencies) {
	if (config.langflowConfigFile === undefined) return undefined;
	if (config.authToken === null || config.authToken === "") throw new Error("langflow_host_token_required");
	const configured = await deps.readConfiguration(config.langflowConfigFile);
	const identity = deps.readIdentity(config.home);
	if (
		identity.hostId !== configured.expectedHostId ||
		identity.dataHomeId !== configured.expectedDataHomeId ||
		configured.runtime.data.dataHomeId !== identity.dataHomeId ||
		configured.runtime.epochOwnership.dataHomeId !== identity.dataHomeId
	)
		throw new Error("langflow_bootstrap_identity_conflict");
	const qualified = await deps.qualify(configured, identity);
	if (
		qualified.candidate.qualification !== "candidate" ||
		qualified.manifest.qualification !== "verified" ||
		qualified.qualificationSha256 !== configured.qualificationSha256 ||
		qualified.manifest.data.dataHomeId !== identity.dataHomeId ||
		qualified.manifest.epochOwnership.dataHomeId !== identity.dataHomeId
	)
		throw new Error("langflow_bootstrap_qualification_conflict");
	const engineConfiguration = await deps.engineConfiguration(configured.engineApiConfigFile, qualified);
	const installed = await deps.installedManifest(qualified.candidate);
	const current = deps.readIdentity(config.home);
	if (current.hostId !== identity.hostId || current.dataHomeId !== identity.dataHomeId)
		throw new Error("langflow_bootstrap_identity_changed");
	const image = await deps.importImage(qualified);
	if (image.imageConfigDigest !== qualified.candidate.engine.imageConfigDigest)
		throw new Error("langflow_bootstrap_image_conflict");
	const driver = deps.driver({
		manifest: qualified.manifest,
		imageConfigDigest: image.imageConfigDigest,
		privateRoot: join(config.home, "langflow"),
		captureIssuerFile: configured.captureIssuerFile,
		engineApiConfigFile: configured.engineApiConfigFile,
		engineApiConfigSha256: engineConfiguration.sha256,
		nativeReservationAuthenticationFile: configured.nativeReservationAuthenticationFile,
	});
	const supervisor = await deps.openSupervisor({
		home: config.home,
		hostId: identity.hostId,
		manifest: qualified.manifest,
		dependencies: { driver, authority: deps.authority(identity), now: () => new Date() },
	});
	await supervisor.start();
	const editor: EditorGatewayConfiguration = {
		identity,
		parentOrigin: configured.parentOrigin,
		editorOrigin: configured.editorOrigin,
		grantDurationMs: configured.grantDurationMs,
		installedManifest: async () => installed,
	};
	return { editor, supervisor, stop: () => supervisor.shutdown() };
}
