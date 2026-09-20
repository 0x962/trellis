import { expect, test } from "bun:test";
import { type Conditions, conditionLabels, conditionLines, mergeReadiness } from "./conditionLines";

const clear: Conditions = {
	merged: false,
	size: { additions: 94, deletions: 12, changedFiles: 6 },
	sizeBand: "medium",
	risk: { auth: "no", migration: "no", dependency: "no", sharedType: "no", deletedTest: "no" },
	tests: { count: 3, failsOn: "4c9a7719d0e1", passesOn: "8b21f0c53ab4", noneApplies: false },
	evidence: { present: 5, required: 5, kind: "frontend" },
	checks: { pass: 48, fail: 0, pending: 0, skipped: 44 },
	threads: 0,
	flows: { total: 2, newest: ["passed", "passed"] },
	base: { enabled: true, available: true, upToDate: true, label: "Ready", report: null },
	ancestors: [{ identifier: "TRL-164", merged: true }],
};

const lineValue = (conditions: Conditions, label: string) =>
	conditionLines(conditions).find((line) => line.label === label)?.value;

test("the nine lines print in one order", () => {
	expect(conditionLines(clear).map((line) => line.label)).toEqual([...conditionLabels]);
});

test("the size line prints the lines, the files and the band as a word", () => {
	expect(lineValue(clear, "size")).toBe("+94 −12 in 6 files · medium");
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

test("the threads line counts the threads that nobody resolved", () => {
	expect(lineValue(clear, "threads")).toBe("none open");
	expect(lineValue({ ...clear, threads: 1 }, "threads")).toBe("1 open");
	expect(lineValue({ ...clear, threads: 4 }, "threads")).toBe("4 open");
});

test("the flows line names every state that has a run, the failure first", () => {
	expect(lineValue(clear, "flows")).toBe("2 passed");
	expect(lineValue({ ...clear, flows: { total: 4, newest: ["running", "passed", "failed", "passed"] } }, "flows")).toBe(
		"1 running · 1 failed · 2 passed",
	);
	expect(lineValue({ ...clear, flows: { total: 0, newest: [] } }, "flows")).toBe("none run");
});

test("a ticket with more runs than the server sends prints the total and the newest run", () => {
	const many = { total: 12, newest: ["passed", "passed", "failed", "passed", "running"] as const };

	expect(lineValue({ ...clear, flows: { total: many.total, newest: [...many.newest] } }, "flows")).toBe(
		"12 runs · newest passed",
	);
});

test("the base line prints the live branch state as words", () => {
	expect(lineValue(clear, "base")).toBe("ready");
	expect(lineValue({ ...clear, base: { ...clear.base!, label: "Not deployed" } }, "base")).toBe("not deployed");
	expect(lineValue({ ...clear, base: null }, "base")).toBe("unknown");
});

test("the ancestors line names each ticket and its state", () => {
	expect(lineValue(clear, "ancestors")).toBe("TRL-164 merged");
	expect(lineValue({ ...clear, ancestors: [] }, "ancestors")).toBe("none");
	expect(
		lineValue(
			{
				...clear,
				ancestors: [
					{ identifier: "TRL-164", merged: true },
					{ identifier: "TRL-167", merged: false },
				],
			},
			"ancestors",
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
		{ flows: { total: 1, newest: ["running"] } },
		{ flows: { total: 1, newest: ["failed"] } },
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
		base: null,
	};

	expect(mergeReadiness(loud)).toBe("yes");
});
