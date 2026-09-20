import { expect, test } from "bun:test";
import { type Conditions, conditionLabels, conditionLines, mergeReadiness } from "./conditionLines";

const clear: Conditions = {
	merged: false,
	size: { additions: 94, deletions: 12, changedFiles: 6 },
	sizeBand: "medium",
	risk: { auth: "no", migration: "no", dependency: "no", sharedType: "no", deletedTest: "no" },
	tests: 3,
	evidence: 2,
	checks: { pass: 48, fail: 0, pending: 0, skipped: 44 },
	threads: 0,
	flows: { running: 0, passed: 2, failed: 0 },
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

test("a missing tests answer and a missing evidence answer read none registered", () => {
	const empty = { ...clear, tests: null, evidence: null };

	expect(lineValue(empty, "tests")).toBe("none registered");
	expect(lineValue(empty, "evidence")).toBe("none registered");
});

test("a floor answer of zero prints no zero", () => {
	expect(lineValue({ ...clear, tests: 0 }, "tests")).toBe("none registered");
});

test("the checks line prints the four counts", () => {
	expect(lineValue(clear, "checks")).toBe("48 pass · 0 fail · 0 pending · 44 skipped");
});

test("the threads line counts the threads that nobody resolved", () => {
	expect(lineValue(clear, "threads")).toBe("none open");
	expect(lineValue({ ...clear, threads: 1 }, "threads")).toBe("1 open");
	expect(lineValue({ ...clear, threads: 4 }, "threads")).toBe("4 open");
});

test("the flows line names every state that has a run", () => {
	expect(lineValue(clear, "flows")).toBe("2 passed");
	expect(lineValue({ ...clear, flows: { running: 1, passed: 2, failed: 1 } }, "flows")).toBe(
		"1 running · 2 passed · 1 failed",
	);
	expect(lineValue({ ...clear, flows: { running: 0, passed: 0, failed: 0 } }, "flows")).toBe("none run");
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
		{ evidence: null },
		{ flows: { running: 1, passed: 0, failed: 0 } },
		{ flows: { running: 0, passed: 0, failed: 1 } },
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
