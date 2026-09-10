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

const foldState = (counts: Pick<CheckCounts, "pass" | "fail" | "pending">): CiState => {
	if (counts.fail > 0) return "fail";
	if (counts.pending > 0) return "pending";
	if (counts.pass > 0) return "pass";
	return "none";
};

// A `cancel` check counts as a failure. A `skipping` check counts as nothing.
export const checkCounts = (checks: readonly Check[]): CheckCounts => {
	const counts = {
		pass: checks.filter((check) => check.bucket === "pass").length,
		fail: checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel").length,
		pending: checks.filter((check) => check.bucket === "pending").length,
	};
	const parts = (["pass", "fail", "pending"] as const)
		.filter((bucket) => counts[bucket] > 0)
		.map((bucket) => `${counts[bucket]} ${bucket}`);
	return { ...counts, state: foldState(counts), label: parts.length === 0 ? "No checks" : parts.join(" · ") };
};
