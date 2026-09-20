import { describe, expect, test } from "bun:test";
import { checkGroup, checkGroups, checkTabStatus } from "./checkGroups";

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
		expect(checkGroup({ status: "FUTURE_STATE" })).toBe("unknown");
	});

	test("uses active status before a prior conclusion", () => {
		expect(checkGroup({ status: "IN_PROGRESS", conclusion: "FAILURE" })).toBe("running");
	});
});

describe("checkTabStatus", () => {
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
	});

	test("reports no state when GitHub has no checks", () => {
		expect(checkTabStatus([])).toBeNull();
	});
});
