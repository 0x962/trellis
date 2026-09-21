import { expect, test } from "bun:test";
import { type Conditions, unmetConditions } from "../../conditionLines/conditionLines";
import { mergeQuestion, unmetLine } from "./unmetLine";

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

test("a pull request with every condition met prints no line", () => {
	expect(unmetLine(unmetConditions(allMet))).toBeNull();
	expect(mergeQuestion(unmetConditions(allMet))).toBe("Merge this pull request?");
});

test("the line names each unmet condition and leaves out the base branch", () => {
	const unmet = unmetConditions({
		...allMet,
		checks: { pass: 36, fail: 1, pending: 0, skipped: 35 },
		evidence: { present: 1, required: 4, kind: "frontend" },
		ancestors: [{ identifier: "TRL-167", merged: false }],
	});

	expect(unmetLine(unmet)).toBe("not yet: 1 check failed · 1 of 4 evidence · TRL-167 not merged");
	expect(mergeQuestion(unmet)).toBe("Merge with 3 conditions unmet?");
});

test("every rule of the readiness word has a phrase", () => {
	const unmet = unmetConditions({
		...allMet,
		checks: { pass: 30, fail: 2, pending: 6, skipped: 35 },
		threads: 1,
		tests: { count: 0, failsOn: null, passesOn: null, noneApplies: false },
		evidence: null,
		flows: { total: 2, newest: { name: "Code Reviewer", status: "failed", findings: 2 }, running: 1, failed: 1 },
	});

	expect(unmet).toEqual([
		"2 checks failed",
		"6 checks pending",
		"1 open thread",
		"no test registered",
		"evidence unknown",
		"1 flow running",
		"1 flow failed",
	]);
	expect(unmetConditions({ ...allMet, tests: null })).toEqual(["tests unknown"]);
	expect(mergeQuestion(["1 open thread"])).toBe("Merge with 1 condition unmet?");
});
