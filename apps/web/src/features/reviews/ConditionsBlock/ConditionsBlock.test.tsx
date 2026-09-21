import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Conditions } from "../conditionLines/conditionLines";
import { ConditionsBlock } from "./ConditionsBlock";
import { ShortConditions } from "./ShortConditions";

const open: Conditions = {
	merged: false,
	size: { additions: 94, deletions: 12, changedFiles: 6 },
	sizeBand: "medium",
	risk: { auth: "no", migration: "no", dependency: "no", sharedType: "no", deletedTest: "no" },
	tests: null,
	evidence: null,
	checks: { pass: 48, fail: 1, pending: 7, skipped: 44 },
	threads: 2,
	flows: { total: 2, newest: ["running", "passed"] },
	base: { behindBy: 3, baseRefName: "master" },
	ancestors: [{ identifier: "TRL-167", merged: false }],
};

const merged: Conditions = {
	...open,
	merged: true,
	tests: { count: 3, failsOn: "4c9a7719d0e1", passesOn: "8b21f0c53ab4", noneApplies: false },
	evidence: { present: 5, required: 5, kind: "frontend" },
	checks: { pass: 55, fail: 0, pending: 0, skipped: 44 },
	threads: 0,
	flows: { total: 2, newest: ["passed", "passed"] },
	ancestors: [{ identifier: "TRL-167", merged: true }],
};

test("the block prints the readiness word", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(html).toMatch(/READY TO MERGE<\/span><\/h2><div[^>]*><span[^>]*>not yet<\/span>/);
});

test("a merged pull request prints the word merged", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={merged} />);

	expect(html).toMatch(/READY TO MERGE<\/span><\/h2><div[^>]*><span[^>]*>merged<\/span>/);
});

test("the nine labels print in one order", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	const order = ["size", "risk", "tests", "evidence", "checks", "threads", "flows", "base", "ancestors"].map((label) =>
		html.indexOf(`>${label}<`),
	);
	expect(order.filter((at) => at > -1)).toHaveLength(9);
	expect(order).toEqual([...order].sort((a, b) => a - b));
});

test("an all clear risk line prints five no answers and draws no badge", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(html).toContain("auth no");
	expect(html).toContain("deleted test no");
	expect(html).not.toContain("badge");
});

test("a condition with no record reads unknown", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(html).toContain("unknown");
	expect(html).not.toContain("0 registered");
});

test("the block draws no button and no link", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(html).not.toContain("<button");
	expect(html).not.toContain("<a ");
	expect(html).not.toContain("disabled");
});

test("the short form prints four lines and no readiness word", () => {
	const html = renderToStaticMarkup(<ShortConditions conditions={open} />);

	expect(html).toContain("MERGE CONDITIONS");
	expect(html).not.toContain("READY TO MERGE");
	expect(html).not.toContain("not yet");
	for (const label of ["evidence", "checks", "threads", "ancestors"]) expect(html).toContain(`>${label}<`);
	for (const label of ["size", "risk", "tests", "flows", "base"]) expect(html).not.toContain(`>${label}<`);
});

test("the short form and the nine-line form print one answer for one condition", () => {
	const short = renderToStaticMarkup(<ShortConditions conditions={open} />);
	const full = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(short).toContain("1 failed · 7 pending · 48 passed · 44 skipped");
	expect(full).toContain("1 failed · 7 pending · 48 passed · 44 skipped");
});
