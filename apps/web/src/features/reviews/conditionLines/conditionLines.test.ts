import { expect, test } from "bun:test";
import { type Conditions, conditionLines, mergeReadiness } from "./conditionLines";

const clear: Conditions = {
	merged: false,
	size: { additions: 94, deletions: 12, changedFiles: 6 },
	sizeBand: "medium",
	risk: { auth: "no", migration: "no", dependency: "no", sharedType: "no", deletedTest: "no" },
	tests: { count: 3, failsOn: "4c9a7719d0e1", passesOn: "8b21f0c53ab4", noneApplies: false },
	evidence: { present: 5, required: 5, kind: "frontend" },
	checks: { pass: 48, fail: 0, pending: 0, skipped: 44 },
	threads: 0,
	flows: { total: 2, newest: { name: "Code Reviewer", status: "passed", findings: 0 }, running: 0, failed: 0 },
	base: { behindBy: 0, baseRefName: "master" },
	stackedOn: null,
	ancestors: [{ identifier: "TRL-164", merged: true }],
};

const lineValue = (conditions: Conditions, label: string) =>
	conditionLines(conditions).find((line) => line.label === label)?.value;

test("the lines print in one order", () => {
	expect(conditionLines(clear).map((line) => line.label)).toEqual([
		"size",
		"risk",
		"tests",
		"evidence",
		"checks",
		"comments",
		"flows",
		"base branch",
		"waits on",
	]);
});

test("the size line prints the lines, the files and the named band", () => {
	expect(lineValue(clear, "size")).toBe("+94 −12 · 6 files · band medium");
});

test("the size line reads unknown when the row carries no size", () => {
	expect(lineValue({ ...clear, size: null, sizeBand: null }, "size")).toBe("unknown");
});

test("an all clear risk line prints five no answers", () => {
	expect(lineValue(clear, "risk")).toBe("auth no · migration no · dependency no · shared type no · deleted test no");
});

test("the risk line prints the answer of every class", () => {
	const risk = { auth: "yes", migration: "yes", dependency: "no", sharedType: "yes", deletedTest: "no" } as const;

	expect(lineValue({ ...clear, risk }, "risk")).toBe(
		"auth yes · migration yes · dependency no · shared type yes · deleted test no",
	);
});

test("the tests line names the count and the two commits", () => {
	expect(lineValue(clear, "tests")).toBe("3 new · all fail on base 4c9a771 · all pass on head 8b21f0c");
});

test("two tests read both, and one test reads it", () => {
	const two = { count: 2, failsOn: "4c9a7719d0e1", passesOn: "8b21f0c53ab4", noneApplies: false };

	expect(lineValue({ ...clear, tests: two }, "tests")).toBe(
		"2 new · both fail on base 4c9a771 · both pass on head 8b21f0c",
	);
	expect(lineValue({ ...clear, tests: { ...two, count: 1 } }, "tests")).toBe(
		"1 new · it fails on base 4c9a771 · it passes on head 8b21f0c",
	);
});

test("tests that name two different base commits print the count alone", () => {
	const mixed = { count: 2, failsOn: null, passesOn: null, noneApplies: false };

	expect(lineValue({ ...clear, tests: mixed }, "tests")).toBe("2 new");
});

test("a record that says no test applies reads so, and no record reads none registered", () => {
	const none = { count: 0, failsOn: null, passesOn: null, noneApplies: true };

	expect(lineValue({ ...clear, tests: none }, "tests")).toBe("no test applies");
	expect(lineValue({ ...clear, tests: { ...none, noneApplies: false } }, "tests")).toBe("none registered");
});

test("a missing test record and a missing evidence floor read unknown", () => {
	const empty = { ...clear, tests: null, evidence: null };

	expect(lineValue(empty, "tests")).toBe("unknown");
	expect(lineValue(empty, "evidence")).toBe("unknown");
});

test("the evidence line prints the two counts and the kind of the change", () => {
	expect(lineValue(clear, "evidence")).toBe("5 of 5 for a frontend change");
	expect(lineValue({ ...clear, evidence: { present: 1, required: 4, kind: "backend" } }, "evidence")).toBe(
		"1 of 4 for a backend change",
	);
});

test("the checks line prints the failure first and drops an outcome of zero", () => {
	expect(lineValue(clear, "checks")).toBe("48 passed · 44 skipped");
	expect(lineValue({ ...clear, checks: { pass: 47, fail: 1, pending: 6, skipped: 44 } }, "checks")).toBe(
		"1 failed · 6 pending · 47 passed · 44 skipped",
	);
});

test("a pull request with no check reads none reported", () => {
	expect(lineValue({ ...clear, checks: { pass: 0, fail: 0, pending: 0, skipped: 0 } }, "checks")).toBe("none reported");
});

test("the comments line counts the comments that nobody resolved", () => {
	expect(lineValue(clear, "comments")).toBe("none open");
	expect(lineValue({ ...clear, threads: 1 }, "comments")).toBe("1 open");
	expect(lineValue({ ...clear, threads: 4 }, "comments")).toBe("4 open");
});

test("the flows line names the newest flow result and its comment count", () => {
	expect(lineValue(clear, "flows")).toBe("Code Reviewer passed · 0 comments");
	expect(
		lineValue(
			{
				...clear,
				flows: { total: 4, newest: { name: "Security Review", status: "failed", findings: 1 }, running: 0, failed: 1 },
			},
			"flows",
		),
	).toBe("Security Review failed · 1 comment");
	expect(lineValue({ ...clear, flows: { total: 0, newest: null, running: 0, failed: 0 } }, "flows")).toBe("none run");
});

test("an older flow run does not change the newest flow result", () => {
	const many = {
		total: 12,
		newest: { name: "Code Reviewer", status: "passed" as const, findings: 4 },
		running: 1,
		failed: 1,
	};

	expect(lineValue({ ...clear, flows: many }, "flows")).toBe("Code Reviewer passed · 4 comments");
});

test("the base branch line prints the target branch and the distance when known", () => {
	expect(lineValue(clear, "base branch")).toBe("master");
	expect(lineValue({ ...clear, base: { behindBy: null, baseRefName: "main" } }, "base branch")).toBe("main");
	expect(lineValue({ ...clear, base: { behindBy: 1, baseRefName: "main" } }, "base branch")).toBe(
		"main · 1 commit behind",
	);
	expect(lineValue({ ...clear, base: { behindBy: 97, baseRefName: "master" } }, "base branch")).toBe(
		"master · 97 commits behind",
	);
});

test("the stacked row prints only when a parent pull request exists", () => {
	expect(lineValue(clear, "stacked on")).toBeUndefined();
	expect(lineValue({ ...clear, stackedOn: { number: 55569, ticketIdentifier: "OP-32" } }, "stacked on")).toBe(
		"#55569 · OP-32",
	);
});

test("the waits on line names each ticket and its state", () => {
	expect(lineValue(clear, "waits on")).toBe("TRL-164 merged");
	expect(lineValue({ ...clear, ancestors: [] }, "waits on")).toBeUndefined();
	expect(
		lineValue(
			{
				...clear,
				ancestors: [
					{ identifier: "TRL-164", merged: true },
					{ identifier: "TRL-167", merged: false },
				],
			},
			"waits on",
		),
	).toBe("TRL-164 merged · TRL-167 open");
});

test("a pull request with every condition clear reads yes", () => {
	expect(mergeReadiness(clear)).toBe("yes");
});

test("a merged pull request reads merged", () => {
	expect(mergeReadiness({ ...clear, merged: true, threads: 3 })).toBe("merged");
});

test("each open condition makes the word not yet", () => {
	const blocked: Array<Partial<Conditions>> = [
		{ checks: { pass: 48, fail: 1, pending: 0, skipped: 44 } },
		{ checks: { pass: 48, fail: 0, pending: 7, skipped: 44 } },
		{ threads: 2 },
		{ tests: null },
		{ tests: { count: 0, failsOn: null, passesOn: null, noneApplies: false } },
		{ evidence: null },
		{ evidence: { present: 1, required: 4, kind: "backend" as const } },
		{
			flows: {
				total: 2,
				newest: { name: "Code Reviewer", status: "passed", findings: 0 },
				running: 1,
				failed: 0,
			},
		},
		{
			flows: {
				total: 2,
				newest: { name: "Code Reviewer", status: "passed", findings: 0 },
				running: 0,
				failed: 1,
			},
		},
		{ ancestors: [{ identifier: "TRL-167", merged: false }] },
	];

	for (const change of blocked) expect(mergeReadiness({ ...clear, ...change })).toBe("not yet");
});

test("the size, the risk answers and the base state stop no merge", () => {
	const risk = { auth: "yes", migration: "yes", dependency: "yes", sharedType: "yes", deletedTest: "yes" } as const;
	const loud = {
		...clear,
		risk,
		size: { additions: 4000, deletions: 20, changedFiles: 90 },
		sizeBand: "large" as const,
		base: { behindBy: 40, baseRefName: "master" },
	};

	expect(mergeReadiness(loud)).toBe("yes");
});
