import type { LangflowSidecarManifestV1 } from "../../../../../../integrations/langflow/package-probe/sidecarManifest";
import type { OciCommandResult } from "../process/process";

export type OciDriverDependencies = {
	run(args: string[]): Promise<OciCommandResult>;
	fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
};

export type OciDriverOptions = {
	manifest: LangflowSidecarManifestV1;
	imageConfigDigest: string;
	privateRoot: string;
	captureIssuerFile: string;
	engineApiConfigFile?: string;
	engineApiConfigSha256?: string;
	nativeReservationAuthenticationFile?: string;
	dockerExecutable?: string;
	dependencies?: Partial<OciDriverDependencies>;
};
