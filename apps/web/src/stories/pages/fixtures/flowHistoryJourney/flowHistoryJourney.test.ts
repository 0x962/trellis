import { describe, expect, test } from "bun:test";
import { FlowExecutionSchema } from "@trellis/api";
import { buildFlowRunRows } from "../../../../features/reviews/FlowRuns/components/FlowRun/buildFlowRunRows";
import { decisionStepKey, flowExecution, replacementAttemptId, retainedReviewOutput } from "../flowHistory";
import { flowHistoryJourney } from "./flowHistoryJourney";

describe("the integrated flow fixture", () => {
	test("uses the native row keys for task and decision controls", () => {
		expect(FlowExecutionSchema.parse(flowExecution)).toEqual(flowExecution);
		const rows = buildFlowRunRows(flowExecution);
		expect(rows.map((row) => row.state)).toEqual(["succeeded", "succeeded", "waiting_human"]);
		expect(rows[0]!.terminal).toBe(true);
		expect(rows[2]!.decidable).toBe(true);
	});
	test("retains output and result identity after an attempt replacement", () => {
		const journey = flowHistoryJourney();
		journey.replaceAttempt();
		const row = buildFlowRunRows(journey.responses["flowExecutions.list"]()[0]!)[0]!;
		expect(row.output).toBe(retainedReviewOutput);
		expect(row.details).toContainEqual({ label: "Attempt", value: replacementAttemptId });
		expect(row.details).toContainEqual({ label: "Result", value: "storybook-flow-result-1" });
	});
	test("preserves the failed decision before a retry and records cancellation after a repeat", () => {
		const journey = flowHistoryJourney(true);
		const decision = { id: flowExecution.id, key: decisionStepKey, approved: true, output: "Approve this evidence." };
		expect(() => journey.responses["flowExecutions.decide"](decision)).toThrow("fails once");
		expect(journey.responses["flowExecutions.list"]()[0]!.state.status).toBe("waiting");
		expect(journey.responses["flowExecutions.decide"](decision).state.status).toBe("succeeded");
		const repeated = journey.responses["flowExecutions.start"]();
		expect(repeated.repeatOf).toBe(flowExecution.id);
		journey.responses["flowExecutions.cancel"]({ id: repeated.id });
		const history = journey.responses["flowExecutions.list"]();
		expect(history.map((execution) => execution.state.status)).toEqual(["canceled", "succeeded"]);
		expect(history[1]!.state.steps[0]!.output).toBe(retainedReviewOutput);
	});
});
