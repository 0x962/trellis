import type { CaptureAuthority, DispatchBlock, HostCaptureControl, LangflowSupervisor } from "../../../langflowHost";
import type { SnapshotCompatibility, SnapshotManifest, SnapshotMetadata } from "../manifest";

export type TrellisSnapshotVersion = Pick<SnapshotCompatibility, "trellisRelease" | "trellisDatabaseVersion">;
export type TrellisCaptureInput = { directory: string; expectedVersion: TrellisSnapshotVersion; block: DispatchBlock };
export type TrellisCaptureResult = {
	staging: string;
	unavailable: SnapshotMetadata["unavailable"];
	native: { ready: boolean; unavailable: unknown[] };
	version: TrellisSnapshotVersion;
};
export type TrellisSealInput = TrellisCaptureInput & { metadata: SnapshotMetadata };
export type TrellisSealResult = {
	directory: string;
	manifest: SnapshotManifest;
	manifestBytes: string;
	manifestDigest: string;
	trellis: TrellisCaptureResult;
};

export type PairedCaptureContext = {
	control: HostCaptureControl;
	supervisor: Pick<LangflowSupervisor, "withHealthyEngine">;
	authority: CaptureAuthority;
	authenticationFile: string;
	readTrellisVersion(): Promise<TrellisSnapshotVersion>;
	captureTrellisAndSeal(input: TrellisSealInput): Promise<TrellisSealResult>;
};

export type PairedCaptureInput = {
	snapshotId: string;
	requestId: string;
	directory: string;
	signal: AbortSignal;
};
