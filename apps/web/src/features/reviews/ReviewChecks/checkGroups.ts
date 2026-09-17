export type ReviewCheck = {
	name?: string;
	context?: string;
	conclusion?: string | null;
	state?: string | null;
	status?: string | null;
	detailsUrl?: string;
	targetUrl?: string;
};

export type CheckGroupKey = "failed" | "running" | "success" | "skipped";
export type CheckTabStatus = "failed" | "blocked" | "running" | "done" | null;

const failedStates = new Set([
	"ACTION_REQUIRED",
	"CANCELLED",
	"ERROR",
	"FAILURE",
	"STALE",
	"STARTUP_FAILURE",
	"TIMED_OUT",
]);
const skippedStates = new Set(["NEUTRAL", "SKIPPED"]);

export const checkGroupOrder: ReadonlyArray<{ key: CheckGroupKey; label: string; expanded: boolean }> = [
	{ key: "failed", label: "Failed", expanded: true },
	{ key: "running", label: "Running", expanded: true },
	{ key: "success", label: "Success", expanded: false },
	{ key: "skipped", label: "Skipped", expanded: false },
];

export const checkState = (check: ReviewCheck) =>
	(check.conclusion || check.state || check.status || "PENDING").toUpperCase();

export const checkGroup = (check: ReviewCheck): CheckGroupKey => {
	const state = checkState(check);
	if (failedStates.has(state)) return "failed";
	if (state === "SUCCESS") return "success";
	if (skippedStates.has(state)) return "skipped";
	return "running";
};

export function checkGroups(checks: readonly ReviewCheck[]) {
	const latest = new Map<string, ReviewCheck>();
	for (const [index, check] of checks.entries()) latest.set(check.name ?? check.context ?? `Check ${index + 1}`, check);
	return checkGroupOrder
		.map((definition) => ({
			...definition,
			checks: [...latest].flatMap(([name, check]) =>
				checkGroup(check) === definition.key ? [{ ...check, name }] : [],
			),
		}))
		.filter((group) => group.checks.length > 0);
}

export function checkTabStatus(checks: readonly ReviewCheck[], blocked: boolean): CheckTabStatus {
	const groups = checkGroups(checks);
	if (blocked) return "blocked";
	if (groups.some((group) => group.key === "failed")) return "failed";
	if (groups.some((group) => group.key === "running")) return "running";
	return groups.length > 0 ? "done" : null;
}
