import { expect, test } from "bun:test";
import type { Evidence, EvidenceFloor, TicketPr } from "@trellis/api";
import { type ConditionsInput, conditionsOf } from "./conditionsOf";

const prRow = (fields: Partial<TicketPr> = {}): TicketPr =>
	({
		number: 57080,
		owner: "canary-technologies-corp",
		repo: "canary",
		url: "https://github.com/canary-technologies-corp/canary/pull/57080",
		state: "open",
		isDraft: false,
		additions: 311,
		deletions: 12,
		changedFiles: 6,
		sizeBand: "medium",
		kind: "backend",
		risk: { auth: "yes", migration: "no", dependency: "no", sharedType: "no", deletedTest: "no" },
		evidence: 1,
		evidenceRequired: 4,
		pass: 47,
		fail: 1,
		pending: 6,
		skipped: 44,
		failedChecks: [],
		openThreads: 0,
		flowRuns: [],
		flowRunCount: 0,
		baseRef: "master",
		headRef: "trellis/op-43",
		stackedOn: null,
		...fields,
	}) as TicketPr;

const record = (kind: Evidence["kind"], fields: Record<string, unknown> = {}): Evidence =>
	({ id: "01M2ZWN8R3YRYK14SQD0YHV5TG", kind, headSha: "9bf82d2a", record: fields, blob: null }) as unknown as Evidence;

const proof = (name: string) => record("test", { name, failsOn: "4c9a7719d0e1", passesOn: "8b21f0c53ab4" });

const floor: EvidenceFloor = {
	kind: "backend",
	required: ["summary", "verify", "test", "contract"],
	present: ["summary", "test"],
	missing: [],
};

const input = (fields: Partial<ConditionsInput> = {}): ConditionsInput => ({
	prRow: prRow(),
	records: [],
	floor,
	waitsOn: [],
	base: null,
	...fields,
});

test("reads the size, the risk answers and the check counts from the pull request row", () => {
	const conditions = conditionsOf(input())!;

	expect(conditions.size).toEqual({ additions: 311, deletions: 12, changedFiles: 6 });
	expect(conditions.sizeBand).toBe("medium");
	expect(conditions.risk.auth).toBe("yes");
	expect(conditions.checks).toEqual({ pass: 47, fail: 1, pending: 6, skipped: 44 });
});

test("answers nothing while the poller has no risk answers", () => {
	expect(conditionsOf(input({ prRow: prRow({ risk: null }) }))).toBeNull();
	expect(conditionsOf(input({ prRow: null }))).toBeNull();
});

test("drops the size when GitHub measured no line count", () => {
	expect(conditionsOf(input({ prRow: prRow({ additions: null }) }))!.size).toBeNull();
});

test("reads the test proofs with the two commits they name", () => {
	const conditions = conditionsOf(input({ records: [proof("one"), proof("two"), record("verify")] }))!;

	expect(conditions.tests).toEqual({
		count: 2,
		failsOn: "4c9a7719d0e1",
		passesOn: "8b21f0c53ab4",
		noneApplies: false,
	});
});

test("drops the commit that two test proofs do not share", () => {
	const other = record("test", { name: "three", failsOn: "0000000aaaa", passesOn: "8b21f0c53ab4" });
	const conditions = conditionsOf(input({ records: [proof("one"), other] }))!;

	expect(conditions.tests!.failsOn).toBeNull();
	expect(conditions.tests!.passesOn).toBe("8b21f0c53ab4");
});

test("reads a record that says no test applies", () => {
	const conditions = conditionsOf(input({ records: [record("test", { none: true, reason: "no new behavior" })] }))!;

	expect(conditions.tests).toEqual({ count: 0, failsOn: null, passesOn: null, noneApplies: true });
});

test("reads the evidence as the present count, the required count and the kind", () => {
	expect(conditionsOf(input())!.evidence).toEqual({ present: 2, required: 4, kind: "backend" });
	expect(conditionsOf(input({ floor: null }))!.evidence).toBeNull();
});

test("reads the name, state and findings of the newest flow run", () => {
	const flowRuns = [
		{ name: "Code Reviewer", status: "waiting", findings: 2 },
		{ name: "Security Review", status: "succeeded", findings: 0 },
	];
	const conditions = conditionsOf(input({ prRow: prRow({ flowRuns, flowRunCount: 9 } as Partial<TicketPr>) }))!;

	expect(conditions.flows).toEqual({
		total: 9,
		newest: { name: "Code Reviewer", status: "running", findings: 2 },
	});
});

test("names every ticket the ticket waits on as an unmerged ancestor", () => {
	const waitsOn = [{ identifier: "TRL-164", title: "T19", status: "started", isQuestion: false }] as const;
	const conditions = conditionsOf(input({ waitsOn: [...waitsOn] }))!;

	expect(conditions.ancestors).toEqual([{ identifier: "TRL-164", merged: false }]);
});

test("reads a merged pull request as merged", () => {
	expect(conditionsOf(input({ prRow: prRow({ state: "merged" }) }))!.merged).toBe(true);
});
