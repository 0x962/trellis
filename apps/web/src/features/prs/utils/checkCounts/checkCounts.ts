import type { Check } from "@trellis/api";

export type CheckCounts = { pass: number; fail: number; pending: number };

const count = (checks: readonly Check[], buckets: readonly string[]) =>
	checks.filter((check) => buckets.includes(check.bucket)).length;

// The three counts the pill shows. A canceled check counts as a failure and
// a skipped check counts in none of the three.
export const checkCounts = (checks: readonly Check[]): CheckCounts => ({
	pass: count(checks, ["pass"]),
	fail: count(checks, ["fail", "cancel"]),
	pending: count(checks, ["pending"]),
});
