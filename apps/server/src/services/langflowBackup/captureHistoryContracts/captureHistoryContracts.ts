import type { SnapshotMetadata } from "../manifest";
import type { CaptureRecords } from "../readCaptureRecords";

export type CapturedHistory = {
	signal: AbortSignal;
	records: CaptureRecords;
	unavailable: SnapshotMetadata["unavailable"];
};
