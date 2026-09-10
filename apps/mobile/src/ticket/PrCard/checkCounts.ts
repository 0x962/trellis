import type { Check, CiState } from "@trellis/api";

// The counts behind the pill on a pull request card. `label` is the pill's
// accessibility text: the non-zero counts joined by " · ", as in
// "3 pass · 1 fail", or "No checks" for an empty list.
export type CheckCounts = {
	pass: number;
	fail: number;
	pending: number;
	state: CiState;
	label: string;
};

// A `cancel` check counts as a failure. A `skipping` check counts as nothing.
export const checkCounts = (_checks: readonly Check[]): CheckCounts => {
	throw new Error("checkCounts is not implemented");
};
