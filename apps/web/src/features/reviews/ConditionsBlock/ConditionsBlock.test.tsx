import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Conditions } from "../conditionLines/conditionLines";
import { ConditionsBlock } from "./ConditionsBlock";

const open: Conditions = {
	merged: false,
	size: { additions: 94, deletions: 12, changedFiles: 6 },
	sizeBand: "medium",
	risk: { auth: "no", migration: "no", dependency: "no", sharedType: "no", deletedTest: "no" },
	tests: null,
	evidence: null,
	checks: { pass: 48, fail: 1, pending: 7, skipped: 44 },
	threads: 2,
	flows: { total: 2, newest: { name: "Code Reviewer", status: "running", findings: 2 }, running: 1, failed: 0 },
	base: { behindBy: 3, baseRefName: "master" },
	stackedOn: null,
	ancestors: [{ identifier: "TRL-167", merged: false }],
};

const merged: Conditions = {
	...open,
	merged: true,
	tests: { count: 3, failsOn: "4c9a7719d0e1", passesOn: "8b21f0c53ab4", noneApplies: false },
	evidence: { present: 5, required: 5, kind: "frontend" },
	checks: { pass: 55, fail: 0, pending: 0, skipped: 44 },
	threads: 0,
	flows: { total: 2, newest: { name: "Code Reviewer", status: "passed", findings: 0 }, running: 0, failed: 0 },
	ancestors: [{ identifier: "TRL-167", merged: true }],
};

test("the block prints the readiness word", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(html).toMatch(/Ready to merge<\/span><\/h2><div[^>]*><span[^>]*>not yet<\/span>/);
});

test("a merged pull request prints the word merged", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={merged} />);

	expect(html).toMatch(/Ready to merge<\/span><\/h2><div[^>]*><span[^>]*>merged<\/span>/);
});

test("the block prints the six labels in one order and leaves the other four out", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	const order = ["evidence", "checks", "comments", "base branch", "waits on"].map((label) =>
		html.indexOf(`>${label}<`),
	);
	expect(order.filter((at) => at > -1)).toHaveLength(5);
	expect(order).toEqual([...order].sort((a, b) => a - b));
	for (const label of ["size", "risk", "tests", "flows", "stacked on"]) expect(html).not.toContain(`>${label}<`);
});

test("a condition with no record reads unknown", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(html).toContain("unknown");
	expect(html).not.toContain("0 registered");
});

test("the checks line counts every outcome", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(html).toContain("1 failed \u00b7 7 pending \u00b7 48 passed \u00b7 44 skipped");
});

test("the block draws no button and no link", () => {
	const html = renderToStaticMarkup(<ConditionsBlock conditions={open} />);

	expect(html).not.toContain("<button");
	expect(html).not.toContain("<a ");
	expect(html).not.toContain("disabled");
});
