import { expect, test } from "bun:test";
import { evidenceFloor, type PrPathFacts } from "@trellis/api";
import { evidenceCheckResult } from "./check.ts";
import { checkText } from "./checkText.ts";

const clearRisk: PrPathFacts["risk"] = {
	api: "no",
	cli: "no",
	background: "no",
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
		floor,
		present: floor.present.length,
		required: floor.required.length,
		verifyCommands,
		checks,
	});

test("prints the backend gaps with exact fill commands", () => {
	const result = resultOf(evidenceFloor({ kind: "backend", risk: clearRisk, hasSummary: true, rows: [] }));

	expect(checkText(result)).toBe(`#57080  OP-43  Add the private properties route
kind: backend            needs the working call and the failing call

  present  summary
  MISSING  working call   send a working request:  trellis evidence add 57080 --kind call --method <method> --path <path> --status <code> --server <url> --request - --response <file>
  MISSING  failing call   send a failing request:  trellis evidence add 57080 --kind call --method <method> --path <path> --status <code> --server <url> --request - --response <file>
  note     1 check failed: merge_gatekeeper
`);
	expect(result.complete).toBe(false);
});

test("keeps a picture out of the proof floor", () => {
	const floor = evidenceFloor({
		kind: "backend",
		risk: { ...clearRisk, dependency: "yes" },
		hasSummary: true,
		rows: [{ kind: "call", record: { status: 200 } }, { kind: "call", record: { status: 400 } }, { kind: "picture" }],
	});
	const result = resultOf(floor);

	expect(result.present).toBe(3);
	expect(result.required).toBe(3);
	expect(result.complete).toBe(true);
	expect(checkText(result)).toContain("kind: backend            proof complete");
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
	expect(checkText(result)).toContain("kind: frontend           proof complete");
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
		required: 3,
		complete: false,
		checks,
	});
	expect(result.items).toHaveLength(3);
});

test("uses the counts published on the pull request row", () => {
	const floor = evidenceFloor({ kind: "backend", risk: clearRisk, hasSummary: true, rows: [] });
	const result = evidenceCheckResult({
		pullRequest: { number: 57080, url: "https://github.com/acme/canary/pull/57080", headSha: "abc123" },
		ticket: { identifier: "OP-43", title: "Add the private properties route" },
		floor,
		present: 2,
		required: 3,
		verifyCommands: [],
		checks,
	});

	expect(checkText(result)).toContain("needs the working call and the failing call");
});
