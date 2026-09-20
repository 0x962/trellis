export type ReviewCheck = {
	__typename?: "CheckRun" | "StatusContext";
	name?: string;
	context?: string;
	workflowName?: string;
	conclusion?: string | null;
	state?: string | null;
	status?: string | null;
	startedAt?: string | null;
	detailsUrl?: string | null;
	targetUrl?: string | null;
};

export type CheckGroupKey =
	| "failed"
	| "running"
	| "pending"
	| "canceled"
	| "success"
	| "skipped"
	| "neutral"
	| "unknown";

const failedStates = new Set(["ACTION_REQUIRED", "ERROR", "FAILURE", "STALE", "STARTUP_FAILURE", "TIMED_OUT"]);
const pendingStates = new Set(["QUEUED", "PENDING", "EXPECTED", "WAITING", "REQUESTED"]);

const checkGroupOrder: readonly CheckGroupKey[] = [
	"failed",
	"running",
	"pending",
	"canceled",
	"unknown",
	"neutral",
	"skipped",
	"success",
];

export const checkState = (check: ReviewCheck) => {
	const status = check.status?.toUpperCase();
	if (status && status !== "COMPLETED") return status;
	return (check.conclusion || check.state || status || "UNKNOWN").toUpperCase();
};

export const checkGroup = (check: ReviewCheck): CheckGroupKey => {
	const state = checkState(check);
	if (failedStates.has(state)) return "failed";
	if (state === "IN_PROGRESS") return "running";
	if (pendingStates.has(state)) return "pending";
	if (state === "CANCELLED") return "canceled";
	if (state === "SUCCESS") return "success";
	if (state === "SKIPPED") return "skipped";
	if (state === "NEUTRAL") return "neutral";
	return "unknown";
};

export function checkGroups(checks: readonly ReviewCheck[]) {
	const occurrences = new Map<string, number>();
	const rows = checks.map((check, index) => {
		const name = check.name || check.context || `Check ${index + 1}`;
		const identity = JSON.stringify([
			check.__typename,
			check.workflowName,
			name,
			check.detailsUrl || check.targetUrl,
			check.startedAt,
		]);
		const occurrence = occurrences.get(identity) ?? 0;
		occurrences.set(identity, occurrence + 1);
		return { ...check, name, key: `${identity}:${occurrence}` };
	});
	return checkGroupOrder
		.map((key) => ({ key, checks: rows.filter((check) => checkGroup(check) === key) }))
		.filter((group) => group.checks.length > 0);
}
