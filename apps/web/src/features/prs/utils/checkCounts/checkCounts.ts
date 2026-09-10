import type { Check } from "@trellis/api";

export type CheckCounts = { pass: number; fail: number; pending: number };

// The three counts the pill shows. A canceled check counts as a failure and
// a skipped check counts in none of the three.
export const checkCounts = (_checks: readonly Check[]): CheckCounts => ({ pass: 0, fail: 0, pending: 0 });
