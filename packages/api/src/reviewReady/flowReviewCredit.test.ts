import { describe, expect, test } from "bun:test";
import { FlowExecutionViewV1Schema } from "../schemas/flowExecutionViewV1.ts";
import { executionViewV1Example, legacyDocumentV1Example } from "../schemas/flowV1Fixtures.ts";
import { type FlowReviewCredit, flowReviewCredit } from "./flowReviewCredit.ts";
import { type ReviewReadyFacts, reviewGaps } from "./reviewReady.ts";

const diffId = "00000000000000000000000008";
const otherDiffId = "00000000000000000000000010";
const flowId = executionViewV1Example.flowId;
const otherFlowId = "00000000000000000000000011";
const {
	publication: _publication,
	lastExecutablePublication: _lastPublication,
	...legacySnapshot
} = legacyDocumentV1Example;

for (const engine of ["legacy", "langflow"] as const) {
	describe(`${engine} review credit`, () => {
		const run = FlowExecutionViewV1Schema.parse({
			...executionViewV1Example,
			engine,
			diffId,
			status: "succeeded",
			detail: "completed",
			...(engine === "legacy" ? { snapshot: legacySnapshot, publication: null, submission: null } : {}),
		});
		const credit = (overrides: Partial<FlowReviewCredit> = {}) =>
			flowReviewCredit({
				diffId,
				hasTicket: true,
				applicableFlowIds: [flowId],
				waived: false,
				runs: [run],
				...overrides,
			});

		test("one applicable success answers only its diff", () => {
			expect(credit()).toBe(true);
			expect(credit({ diffId: otherDiffId })).toBe(false);
			expect(credit({ runs: [{ ...run, diffId: null }] })).toBe(false);
			expect(credit({ applicableFlowIds: [flowId, otherFlowId] })).toBe(true);
		});

		test("a later failed run keeps an older success", () => {
			const later = { ...run, status: "failed" as const, reviewedHead: "a".repeat(40) };
			expect(credit({ runs: [later, run] })).toBe(true);
		});

		test("the reviewed head is information", () => {
			for (const reviewedHead of [null, "old-head", "b".repeat(40)]) {
				const historical = { ...run, reviewedHead };
				expect(credit({ runs: [historical] })).toBe(true);
			}
		});

		test("catalog deletion removes credit while another flow still applies", () => {
			expect(credit({ applicableFlowIds: [otherFlowId] })).toBe(false);
			expect(credit({ applicableFlowIds: [] })).toBe(true);
		});

		test("waivers and missing tickets preserve the existing exceptions", () => {
			expect(credit({ waived: true, runs: [] })).toBe(true);
			expect(credit({ hasTicket: false, runs: [] })).toBe(true);
			expect(credit({ runs: [] })).toBe(false);
		});

		test("output text does not supply a successful status", () => {
			for (const status of ["running", "waiting", "failed", "canceled"] as const) {
				const unfinished = { ...run, status, output: "Approved. The review succeeded." };
				expect(credit({ runs: [unfinished] })).toBe(false);
			}
		});

		test("flow credit leaves the other review requirements independent", () => {
			const facts: ReviewReadyFacts = {
				state: "open",
				localState: "ready",
				failedChecks: 0,
				pendingChecks: 0,
				hasExplanation: true,
				hasEvidence: true,
				flowAnswered: credit(),
				openFindings: 0,
				mergeable: "mergeable",
			};
			expect(reviewGaps(facts)).toEqual([]);
			for (const [change, kind] of [
				[{ failedChecks: 1 }, "checks-failed"],
				[{ pendingChecks: 1 }, "checks-pending"],
				[{ openFindings: 1 }, "findings"],
				[{ mergeable: "conflicting" }, "conflict"],
				[{ hasEvidence: false }, "evidence"],
				[{ hasExplanation: false }, "explanation"],
				[{ localState: "not-ready" }, "not-asked"],
			] as const)
				expect(reviewGaps({ ...facts, ...change })).toEqual([{ kind, count: 1 }]);
		});
	});
}
