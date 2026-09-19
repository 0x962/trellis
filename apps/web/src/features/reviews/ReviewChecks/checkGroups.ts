export type ReviewCheck = {
	__typename?: "CheckRun" | "StatusContext";
	name?: string;
	context?: string;
	workflowName?: string;
	conclusion?: string | null;
	state?: string | null;
	status?: string | null;
	startedAt?: string | null;
	completedAt?: string | null;
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
export type CheckTabStatus = "failed" | "running" | "pending" | "canceled" | "done" | "neutral" | "unknown" | null;

const failedStates = new Set(["ACTION_REQUIRED", "ERROR", "FAILURE", "STALE", "STARTUP_FAILURE", "TIMED_OUT"]);
const pendingStates = new Set(["QUEUED", "PENDING", "EXPECTED", "WAITING", "REQUESTED"]);

export const checkGroupOrder: ReadonlyArray<{ key: CheckGroupKey; label: string; expanded: boolean }> = [
	{ key: "failed", label: "Failed", expanded: true },
	{ key: "running", label: "In progress", expanded: true },
	{ key: "pending", label: "Pending", expanded: true },
	{ key: "canceled", label: "Canceled", expanded: true },
	{ key: "unknown", label: "Unknown", expanded: true },
	{ key: "neutral", label: "Neutral", expanded: false },
	{ key: "skipped", label: "Skipped", expanded: false },
	{ key: "success", label: "Successful", expanded: false },
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

export const checkLabel = (check: ReviewCheck) => {
	const state = checkState(check);
	if (state === "SUCCESS") return "Passed";
	if (state === "FAILURE") return "Failed";
	if (state === "CANCELLED") return "Canceled";
	if (state === "COMPLETED") return "Conclusion unavailable";
	return state.charAt(0) + state.slice(1).toLowerCase().replaceAll("_", " ");
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
		.map((definition) => ({ ...definition, checks: rows.filter((check) => checkGroup(check) === definition.key) }))
		.filter((group) => group.checks.length > 0);
}

const statusForCounts = (counts: Record<CheckGroupKey, number>): CheckTabStatus => {
	if (counts.failed) return "failed";
	if (counts.running) return "running";
	if (counts.pending) return "pending";
	if (counts.canceled) return "canceled";
	if (counts.unknown) return "unknown";
	if (counts.success) return "done";
	if (counts.skipped || counts.neutral) return "neutral";
	return null;
};

export function checkSummary(checks: readonly ReviewCheck[]) {
	const groups = checkGroups(checks);
	const counts = Object.fromEntries(checkGroupOrder.map(({ key }) => [key, 0])) as Record<CheckGroupKey, number>;
	for (const group of groups) counts[group.key] = group.checks.length;
	const total = checks.length;
	const status = statusForCounts(counts);
	const titles: Record<NonNullable<CheckTabStatus>, string> = {
		failed: "Some checks failed",
		running: "Checks are in progress",
		pending: "Checks are pending",
		canceled: counts.canceled === total ? "All checks were canceled" : "Some checks were canceled",
		unknown: "Check status unavailable",
		done: counts.success === total ? "All checks passed" : "Checks completed",
		neutral: counts.skipped === total ? "All checks were skipped" : "Checks completed",
	};
	const labels: Record<CheckGroupKey, string> = {
		failed: "failed",
		running: "in progress",
		pending: "pending",
		canceled: "canceled",
		success: "passed",
		skipped: "skipped",
		neutral: "neutral",
		unknown: "unknown",
	};
	const description = groups
		.flatMap((group) => {
			if (group.key !== "pending") return [`${group.checks.length} ${labels[group.key]}`];
			const states = new Map<string, number>();
			for (const check of group.checks) {
				const label = checkLabel(check).toLowerCase();
				states.set(label, (states.get(label) ?? 0) + 1);
			}
			return [...states].map(([label, count]) => `${count} ${label}`);
		})
		.join(", ");
	return { total, counts, status, title: status ? titles[status] : "No checks reported", description };
}

export const checkTabStatus = (checks: readonly ReviewCheck[]): CheckTabStatus => checkSummary(checks).status;

export const checkDuration = (check: ReviewCheck): string | null => {
	if (check.status && check.status.toUpperCase() !== "COMPLETED") return null;
	if (!check.startedAt || !check.completedAt) return null;
	const started = Date.parse(check.startedAt);
	const completed = Date.parse(check.completedAt);
	if (!Number.isFinite(started) || !Number.isFinite(completed) || started <= 0 || completed < started) return null;
	const seconds = Math.floor((completed - started) / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
