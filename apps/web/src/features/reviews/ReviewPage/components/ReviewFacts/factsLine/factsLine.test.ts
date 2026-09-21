import { expect, test } from "bun:test";
import type { Conditions } from "../../../../conditionLines/conditionLines";
import { factsLine } from "./factsLine";

const allMet: Conditions = {
	merged: false,
	size: { additions: 12, deletions: 3, changedFiles: 2 },
	sizeBand: "small",
	risk: { auth: "no", migration: "no", dependency: "no", sharedType: "no", deletedTest: "no" },
	tests: { count: 1, failsOn: "4c9a771aa", passesOn: "8b21f0caa", noneApplies: false },
	evidence: { present: 4, required: 4, kind: "backend" },
	checks: { pass: 37, fail: 0, pending: 0, skipped: 35 },
	threads: 0,
	flows: { total: 1, newest: { name: "Code Reviewer", status: "passed", findings: 0 }, running: 0, failed: 0 },
	base: { behindBy: 3, baseRefName: "master" },
	ancestors: [],
};

test("a pull request with every condition met reads as ready", () => {
	expect(factsLine(allMet)).toBe("ready to merge");
});

test("a merged pull request reads as merged", () => {
	expect(factsLine({ ...allMet, merged: true })).toBe("merged");
});

test("the line names every condition that stops the merge", () => {
	const line = factsLine({
		...allMet,
		checks: { pass: 36, fail: 1, pending: 0, skipped: 35 },
		threads: 2,
	});

	expect(line).toBe("1 check failed · 2 open threads");
});

test("a pull request with no risk answers reads as loading", () => {
	expect(factsLine(null)).toBe("conditions loading");
});
