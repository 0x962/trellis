import type {
	RuntimeCaptureIdentity,
	RuntimeCaptureRoot,
	RuntimeCaptureUnavailable,
	RuntimeLaunchCaptureProviderRoot,
} from "@trellis/runtime-protocol";

export type CaptureRepository = {
	workspace: string;
	attemptIds: string[];
	git: string | null;
	common: string | null;
	objectFormat: "sha1" | "sha256" | null;
};

export type CaptureProvider = {
	identity: RuntimeCaptureIdentity;
	root: RuntimeLaunchCaptureProviderRoot;
	directory: string;
};

export type CaptureDiscovery = {
	identities: RuntimeCaptureIdentity[];
	repositories: CaptureRepository[];
	providerScopes: string[];
	providers: CaptureProvider[];
	unavailable: RuntimeCaptureUnavailable[];
};

export type CaptureRootState = {
	root: RuntimeCaptureRoot;
	directory: string;
	excluded: string[];
};
