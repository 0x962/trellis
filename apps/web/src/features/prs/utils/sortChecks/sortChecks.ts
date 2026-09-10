import type { Check, CheckBucket } from "@trellis/api";

// A check that failed or was canceled never produced a green build, so both
// read as a failure.
const failed = (bucket: CheckBucket) => bucket === "fail" || bucket === "cancel";

// The check order the expanded row shows: every failing check first, then
// the rest in the order gh reported. A canceled check counts as a failure.
export const sortChecks = (checks: readonly Check[]): Check[] => [
	...checks.filter((check) => failed(check.bucket)),
	...checks.filter((check) => !failed(check.bucket)),
];
