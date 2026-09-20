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

const record = (kind: Evidence["kind"]): Evidence =>
	({ id: "01M2ZWN8R3YRYK14SQD0YHV5TG", kind, headSha: "9bf82d2a", record: {}, blob: null }) as unknown as Evidence;

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

test("counts the evidence records of kind test as the test proofs", () => {
	const conditions = conditionsOf(input({ records: [record("test"), record("test"), record("verify")] }))!;

	expect(conditions.tests).toBe(2);
});

test("counts the evidence as the floor items that are present", () => {
	expect(conditionsOf(input())!.evidence).toBe(2);
	expect(conditionsOf(input({ floor: null }))!.evidence).toBeNull();
});

test("counts a waiting flow run as running and leaves a canceled run out", () => {
	const flowRuns = [{ status: "waiting" }, { status: "running" }, { status: "succeeded" }, { status: "canceled" }];
	const conditions = conditionsOf(input({ prRow: prRow({ flowRuns } as Partial<TicketPr>) }))!;

	expect(conditions.flows).toEqual({ running: 2, passed: 1, failed: 0 });
});

test("names every ticket the ticket waits on as an unmerged ancestor", () => {
	const waitsOn = [{ identifier: "TRL-164", title: "T19", status: "started", isQuestion: false }] as const;
	const conditions = conditionsOf(input({ waitsOn: [...waitsOn] }))!;

	expect(conditions.ancestors).toEqual([{ identifier: "TRL-164", merged: false }]);
});

test("reads a merged pull request as merged", () => {
	expect(conditionsOf(input({ prRow: prRow({ state: "merged" }) }))!.merged).toBe(true);
});
