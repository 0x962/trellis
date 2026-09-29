import type { LangflowSidecarManifestV1 } from "../../../../../integrations/langflow/package-probe/sidecarManifest";
import type {
	AdmissionStateV1,
	DeliveryAuthorityV1,
	RenewalReceiptV1,
	TakeoverReceiptV1,
} from "../../langflowContracts";

export type SidecarIdentity = {
	dataHomeId: string;
	hostId: string;
	ownerId: string;
	instanceId: string;
	manifestDigest: string;
};

export type SidecarObservation = {
	identity: SidecarIdentity;
	challenge: string;
	state: "running" | "exited" | "absent" | "unknown";
	health: "healthy" | "unhealthy" | "unknown";
	endpoint: string | null;
};

export type LiveOwnership = {
	id: string;
	identity: SidecarIdentity;
	observedAt: string;
	endpoint: string;
};

export type OwnerRevocation = {
	id: string;
	identity: SidecarIdentity;
	observationId: string;
};

export type SidecarDriver = {
	start(input: {
		identity: SidecarIdentity;
		manifest: LangflowSidecarManifestV1;
		dataDirectory: string;
		authenticationFile: string;
	}): Promise<void>;
	observe(input: {
		identity: SidecarIdentity;
		challenge: string;
		authenticationFile: string;
	}): Promise<SidecarObservation>;
	stop(identity: SidecarIdentity): Promise<void>;
};

export type OwnershipSnapshot = {
	canceled: boolean;
	authority: DeliveryAuthorityV1;
	admission: AdmissionStateV1;
};

export type AuthorityCommit = {
	requestBytes: string;
	authorityBytes: string;
	receipt: RenewalReceiptV1 | TakeoverReceiptV1;
	observation: LiveOwnership;
	revocation: OwnerRevocation | null;
};

export type AuthorityPort = {
	revokeOwner(input: { identity: SidecarIdentity; observationId: string }): Promise<OwnerRevocation>;
	readRevocation(input: { dataHomeId: string; hostId: string; ownerId: string }): Promise<OwnerRevocation | null>;
	readReceipt(input: { executionId: string; requestId: string }): Promise<AuthorityCommit | null>;
	read(executionId: string): Promise<OwnershipSnapshot>;
	commit(input: AuthorityCommit): Promise<RenewalReceiptV1 | TakeoverReceiptV1>;
};

export type SupervisorDependencies = {
	driver: SidecarDriver;
	authority: AuthorityPort;
	now(): Date;
};
