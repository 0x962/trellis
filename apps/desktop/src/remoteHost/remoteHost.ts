import type {
	HostDescriptor,
	HostProfileId,
	SshHostProfile,
} from "@trellis/api";
import type { HostCredential } from "../hostProfiles/credentialStore/index.ts";

export const REMOTE_HOST_BOOTSTRAP_COMMAND = "trellis host bootstrap --version 1";

export type RemoteHostDeployment = {
	kind: "native" | "oci";
	port: number;
};

export type RemoteHostBootstrap = {
	version: 1;
	user: string;
	descriptor: HostDescriptor;
	deployment: RemoteHostDeployment;
	token: string;
};

export type RemoteHostConnection = {
	profileId: HostProfileId;
	origin: string;
	descriptor: HostDescriptor;
	user: string;
	deployment: RemoteHostDeployment;
};

export type RemoteHostConnectInput = {
	profile: SshHostProfile;
	credential: HostCredential;
	expectedCompatibility: Pick<HostDescriptor, "apiVersion" | "runtimeProtocol">;
};

export type RemoteHostTransport = {
	connect: (input: RemoteHostConnectInput) => Promise<RemoteHostConnection>;
	disconnect: (profileId: HostProfileId) => Promise<void>;
};
