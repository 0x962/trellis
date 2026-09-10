import { describe, expect, test } from "bun:test";
import { checkList } from "../../../../../test/prs";
import { checkCounts } from "./checkCounts";

describe("checkCounts", () => {
	// PR-27. The pill shows three counts. A canceled check failed, and a
	// skipped check ran no test, so it counts in none of the three.
	test("counts a canceled check as a failure and leaves a skipped check out", () => {
		const checks = checkList(
			["lint", "pass"],
			["typecheck", "fail"],
			["e2e", "cancel"],
			["build", "pending"],
			["docs", "skipping"],
		);
		expect(checkCounts(checks)).toEqual({ pass: 1, fail: 2, pending: 1 });
		expect(checkCounts([])).toEqual({ pass: 0, fail: 0, pending: 0 });
	});
});
