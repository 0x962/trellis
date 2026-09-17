import { describe, expect, test } from "bun:test";
import { checkGroups, checkTabStatus } from "./checkGroups";

describe("checkGroups", () => {
	test("sorts checks into the requested status order", () => {
		const groups = checkGroups([
			{ name: "Lint", conclusion: "SUCCESS" },
			{ name: "Preview", conclusion: "SKIPPED" },
			{ name: "Tests", conclusion: "FAILURE" },
			{ name: "Build", status: "IN_PROGRESS" },
		]);

		expect(groups.map((group) => group.key)).toEqual(["failed", "running", "success", "skipped"]);
		expect(groups.map((group) => group.checks.map((check) => check.name))).toEqual([
			["Tests"],
			["Build"],
			["Lint"],
			["Preview"],
		]);
	});

	test("keeps only the latest check with a repeated name", () => {
		const groups = checkGroups([
			{ name: "Tests", conclusion: "FAILURE" },
			{ name: "Tests", conclusion: "SUCCESS" },
		]);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.key).toBe("success");
	});
});

describe("checkTabStatus", () => {
	test("reports blocked before running and done", () => {
		expect(checkTabStatus([{ name: "Tests", status: "IN_PROGRESS" }], true)).toBe("blocked");
	});

	test("reports failed when a check fails", () => {
		expect(checkTabStatus([{ name: "Tests", conclusion: "FAILURE" }], false)).toBe("failed");
	});

	test("reports running while one check is active", () => {
		expect(
			checkTabStatus(
				[
					{ name: "Lint", conclusion: "SUCCESS" },
					{ name: "Tests", status: "QUEUED" },
				],
				false,
			),
		).toBe("running");
	});

	test("reports done when every check has settled", () => {
		expect(
			checkTabStatus(
				[
					{ name: "Lint", conclusion: "SUCCESS" },
					{ name: "Preview", conclusion: "SKIPPED" },
				],
				false,
			),
		).toBe("done");
	});

	test("reports no state when GitHub has no checks", () => {
		expect(checkTabStatus([], false)).toBeNull();
	});
});
