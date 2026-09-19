import { describe, expect, test } from "bun:test";
import { checkDuration, checkGroup, checkGroups, checkLabel, checkSummary, checkTabStatus } from "./checkGroups";

describe("checkGroups", () => {
	test("separates failed, active, pending, and settled outcomes", () => {
		const groups = checkGroups([
			{ name: "Lint", conclusion: "SUCCESS" },
			{ name: "Preview", conclusion: "SKIPPED" },
			{ name: "Tests", conclusion: "FAILURE" },
			{ name: "Build", status: "IN_PROGRESS" },
			{ name: "Deploy", status: "QUEUED" },
			{ name: "Audit", conclusion: "NEUTRAL" },
			{ name: "Release", conclusion: "CANCELLED" },
		]);
		expect(groups.map((group) => group.key)).toEqual([
			"failed",
			"running",
			"pending",
			"canceled",
			"neutral",
			"skipped",
			"success",
		]);
	});

	test("preserves checks with equal names across workflows and runs", () => {
		const checks = [
			{
				__typename: "CheckRun" as const,
				name: "Tests",
				workflowName: "CI",
				conclusion: "FAILURE",
				detailsUrl: "https://github.com/run/1",
			},
			{
				__typename: "CheckRun" as const,
				name: "Tests",
				workflowName: "Release",
				conclusion: "SUCCESS",
				detailsUrl: "https://github.com/run/2",
			},
			{
				__typename: "CheckRun" as const,
				name: "Tests",
				workflowName: "CI",
				conclusion: "SUCCESS",
				detailsUrl: "https://github.com/run/3",
			},
			{ __typename: "StatusContext" as const, context: "Tests", state: "PENDING" },
		];
		const rows = checkGroups(checks).flatMap((group) => group.checks);
		expect(rows).toHaveLength(4);
		expect(new Set(rows.map((row) => row.key)).size).toBe(4);
		expect(checkTabStatus(checks)).toBe("failed");
	});

	test("preserves ambiguous repeated nodes with unique keys", () => {
		const rows = checkGroups([
			{ name: "Tests", conclusion: "SUCCESS" },
			{ name: "Tests", conclusion: "SUCCESS" },
		]);
		expect(rows[0]?.checks).toHaveLength(2);
		expect(rows[0]?.checks[0]?.key).not.toBe(rows[0]?.checks[1]?.key);
	});

	test.each(["QUEUED", "EXPECTED", "WAITING", "REQUESTED", "PENDING"])("keeps %s pending", (status) => {
		expect(checkGroup({ status })).toBe("pending");
		expect(checkLabel({ status })).toBe(status.charAt(0) + status.slice(1).toLowerCase());
	});

	test.each(["ACTION_REQUIRED", "ERROR", "FAILURE", "STALE", "STARTUP_FAILURE", "TIMED_OUT"])(
		"keeps %s failed",
		(conclusion) => {
			expect(checkGroup({ conclusion })).toBe("failed");
		},
	);

	test("keeps missing and unrecognized states explicit", () => {
		expect(checkGroup({})).toBe("unknown");
		expect(checkGroup({ status: "COMPLETED", conclusion: null })).toBe("unknown");
		expect(checkLabel({ status: "COMPLETED", conclusion: null })).toBe("Conclusion unavailable");
		expect(checkGroup({ status: "FUTURE_STATE" })).toBe("unknown");
	});

	test("uses active status before a prior conclusion", () => {
		expect(checkGroup({ status: "IN_PROGRESS", conclusion: "FAILURE" })).toBe("running");
	});
});

describe("checkSummary", () => {
	test("reports failures alongside exact pending states", () => {
		const summary = checkSummary([
			{ name: "Lint", conclusion: "FAILURE" },
			{ name: "Build", status: "IN_PROGRESS" },
			{ name: "Tests", status: "QUEUED" },
			{ name: "Deploy", status: "WAITING" },
		]);
		expect(summary.title).toBe("Some checks failed");
		expect(summary.description).toBe("1 failed, 1 in progress, 1 queued, 1 waiting");
		expect(summary.total).toBe(4);
	});

	test("does not claim all checks passed when some checks skipped", () => {
		expect(checkSummary([{ conclusion: "SUCCESS" }, { conclusion: "SKIPPED" }]).title).toBe("Checks completed");
		expect(checkSummary([{ conclusion: "SUCCESS" }]).title).toBe("All checks passed");
	});

	test("keeps canceled and unknown checks out of passed status", () => {
		expect(checkTabStatus([{ conclusion: "SUCCESS" }, { conclusion: "CANCELLED" }])).toBe("canceled");
		expect(checkTabStatus([{ conclusion: "SUCCESS" }, {}])).toBe("unknown");
	});

	test("distinguishes pending from active checks", () => {
		expect(checkTabStatus([{ status: "QUEUED" }])).toBe("pending");
		expect(checkTabStatus([{ status: "IN_PROGRESS" }, { status: "QUEUED" }])).toBe("running");
	});

	test("reports settled checks without success as neutral", () => {
		expect(checkTabStatus([{ conclusion: "SKIPPED" }, { conclusion: "NEUTRAL" }])).toBe("neutral");
		expect(checkSummary([{ conclusion: "SKIPPED" }]).title).toBe("All checks were skipped");
	});

	test("reports no state when GitHub has no checks", () => {
		expect(checkTabStatus([])).toBeNull();
		expect(checkSummary([]).total).toBe(0);
	});
});

describe("checkDuration", () => {
	test("shows elapsed runtime for completed checks", () => {
		expect(checkDuration({ startedAt: "2026-09-19T12:00:00Z", completedAt: "2026-09-19T12:02:03Z" })).toBe("2m 3s");
		expect(checkDuration({ startedAt: "2026-09-19T12:00:00Z", completedAt: "2026-09-19T13:02:03Z" })).toBe("1h 2m");
	});

	test("does not show completed duration for an active check", () => {
		expect(
			checkDuration({ status: "IN_PROGRESS", startedAt: "2026-09-19T12:00:00Z", completedAt: "2026-09-19T12:02:03Z" }),
		).toBeNull();
	});

	test("does not invent duration for unavailable timestamps", () => {
		expect(checkDuration({ status: "QUEUED" })).toBeNull();
		expect(checkDuration({ startedAt: "2026-09-19T12:00:00Z" })).toBeNull();
		expect(checkDuration({ startedAt: "0001-01-01T00:00:00Z", completedAt: "2026-09-19T12:00:00Z" })).toBeNull();
		expect(checkDuration({ startedAt: "invalid", completedAt: "2026-09-19T12:00:00Z" })).toBeNull();
		expect(checkDuration({ startedAt: "2026-09-19T13:00:00Z", completedAt: "2026-09-19T12:00:00Z" })).toBeNull();
	});
});
