import type { SnapshotMetadata } from "../manifest";
import type { CaptureRecords } from "../readCaptureRecords";

export type CapturedHistory = {
	records: CaptureRecords;
	unavailable: SnapshotMetadata["unavailable"];
};
