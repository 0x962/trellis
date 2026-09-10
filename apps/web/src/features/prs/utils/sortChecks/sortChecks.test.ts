import { describe, expect, test } from "bun:test";
import { checkList } from "../../../../../test/prs";
import { sortChecks } from "./sortChecks";

describe("sortChecks", () => {
	// PR-26. A canceled check failed too, so it sits with the failures. Two
	// checks in one group keep the order gh reported.
	test("puts the failing checks first and stays stable", () => {
		const checks = checkList(
			["lint", "pass"],
			["typecheck", "fail"],
			["e2e", "cancel"],
			["build", "pending"],
			["docs", "skipping"],
			["test", "fail"],
			["size", "pass"],
		);
		expect(sortChecks(checks).map((check) => check.name)).toEqual([
			"typecheck",
			"e2e",
			"test",
			"lint",
			"build",
			"docs",
			"size",
		]);
	});
});
