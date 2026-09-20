import { expect, test } from "bun:test";
import { evidenceFloor, type PrPathFacts } from "@trellis/api";
import { checkText, evidenceCheckResult } from "./checkText.ts";

const clearRisk: PrPathFacts["risk"] = {
	auth: "no",
	migration: "no",
	dependency: "no",
	sharedType: "no",
	deletedTest: "no",
};

const checks = {
	pass: 47,
	fail: 1,
	pending: 6,
	skipped: 44,
	failedChecks: [{ name: "merge_gatekeeper", workflow: "9.AUTO Merge gatekeeper" }],
};

const resultOf = (
	floor: ReturnType<typeof evidenceFloor>,
	verifyCommands = ["make check-fix", "pytest routines threads agent"],
) =>
	evidenceCheckResult({
		pullRequest: { number: 57080, url: "https://github.com/acme/canary/pull/57080", headSha: "abc123" },
		ticket: { identifier: "OP-43", title: "Add the private properties route" },
		kind: floor.kind,
		floor,
		verifyCommands,
		checks,
	});

test("prints the backend gaps with exact fill commands", () => {
	const result = resultOf(evidenceFloor({ kind: "backend", risk: clearRisk, hasSummary: true, rows: [] }));

	expect(checkText(result)).toBe(`#57080  OP-43  Add the private properties route
kind: backend            1 of 4 required present

  present  summary
  MISSING  verify record   run each Verify command (make check-fix; pytest routines threads agent):  trellis evidence add 57080 --kind verify --cmd "<command>" --exit <code> --sha abc123 --tail -
  MISSING  test proof      name each new test:  trellis evidence add 57080 --kind test --name <test> --fails-on <base> --passes-on abc123
  MISSING  contract        write the before and after table, or:  trellis evidence add 57080 --kind contract --before - --after -
  note     1 check failed: merge_gatekeeper
`);
	expect(result.complete).toBe(false);
});

test("warns when the ticket has no parsed Verify command", () => {
	const result = resultOf(evidenceFloor({ kind: "backend", risk: clearRisk, hasSummary: true, rows: [] }), []);

	expect(result.items.find((item) => item.item === "verify")?.note).toBe("the ticket has no parsed Verify command:");
});

test("prints a due picture with its fill command", () => {
	const floor = evidenceFloor({
		kind: "backend",
		risk: { ...clearRisk, dependency: "yes" },
		hasSummary: true,
		rows: [{ kind: "verify" }, { kind: "test" }, { kind: "contract" }],
	});
	const result = resultOf(floor);

	expect(result.items.at(-1)).toEqual({
		item: "picture",
		label: "picture",
		status: "due",
		note: "add one picture:",
		command: "trellis evidence add 57080 --kind picture --file <path> --why <reason>",
	});
	expect(checkText(result)).toContain("  due      picture         add one picture:");
});

test("prints a complete frontend floor", () => {
	const floor = evidenceFloor({
		kind: "frontend",
		risk: clearRisk,
		hasSummary: true,
		rows: [{ kind: "after" }, { kind: "before" }, { kind: "capture" }, { kind: "console" }],
	});
	const result = resultOf(floor);

	expect(result.complete).toBe(true);
	expect(result.present).toBe(5);
	expect(result.items.map((item) => item.status)).toEqual(["present", "present", "present", "present", "present"]);
	expect(checkText(result)).toContain("kind: frontend           5 of 5 required present");
});

test("returns the stable JSON shape", () => {
	const result = resultOf(evidenceFloor({ kind: "backend", risk: clearRisk, hasSummary: true, rows: [] }));

	expect(result).toMatchObject({
		pullRequest: {
			number: 57080,
			url: "https://github.com/acme/canary/pull/57080",
			headSha: "abc123",
		},
		ticket: { identifier: "OP-43", title: "Add the private properties route" },
		kind: "backend",
		present: 1,
		required: 4,
		complete: false,
		checks,
	});
	expect(result.items).toHaveLength(4);
});
