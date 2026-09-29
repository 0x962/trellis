import type { CaptureAuthority, DispatchBlock, LangflowHostControl, LangflowSupervisor } from "../../../langflowHost";
import type { SnapshotCompatibility, SnapshotMetadata } from "../manifest";

export type TrellisSnapshotVersion = Pick<SnapshotCompatibility, "trellisRelease" | "trellisDatabaseVersion">;
export type TrellisCaptureInput = { directory: string; expectedVersion: TrellisSnapshotVersion; block: DispatchBlock };
export type TrellisCaptureResult = {
	staging: string;
	unavailable: SnapshotMetadata["unavailable"];
	native: { ready: boolean; unavailable: unknown[] };
	version: TrellisSnapshotVersion;
};

export type PairedCaptureContext = {
	control: LangflowHostControl;
	supervisor: LangflowSupervisor;
	authority: CaptureAuthority;
	authenticationFile: string;
	readTrellisVersion(): Promise<TrellisSnapshotVersion>;
	captureTrellis(input: TrellisCaptureInput): Promise<TrellisCaptureResult>;
};

export type PairedCaptureInput = {
	snapshotId: string;
	requestId: string;
	directory: string;
	signal: AbortSignal;
};
