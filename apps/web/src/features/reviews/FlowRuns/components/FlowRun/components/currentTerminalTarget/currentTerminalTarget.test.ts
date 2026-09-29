import { expect, test } from "bun:test";
import { executionViewV1Example, occurrenceV1Example } from "@trellis/api";
import { currentTerminalTarget } from "./currentTerminalTarget";

const attempt = { ...occurrenceV1Example.attempts[0]!, resultId: null };
const target = {
	task: { key: "selected", runId: attempt.agentRunId, attemptId: attempt.attemptId, resultId: null },
	attempt,
};

test("an open terminal receives the completed result for its exact attempt", () => {
	const completed = { ...attempt, state: "exited" as const, resultId: "completed-result" };
	const view = {
		...executionViewV1Example,
		occurrences: [{ ...occurrenceV1Example, attempts: [completed, { ...completed, attemptId: "newer" }] }],
	};
	const refreshed = currentTerminalTarget(view, target)!;
	expect(refreshed.attempt).toBe(completed);
	expect(refreshed.task).toEqual({ ...target.task, resultId: "completed-result" });
});

test("another step, run, or attempt cannot replace the open terminal target", () => {
	for (const field of ["stepId", "agentRunId", "attemptId"] as const) {
		const view = {
			...executionViewV1Example,
			occurrences: [
				{ ...occurrenceV1Example, attempts: [{ ...attempt, [field]: "another", resultId: "other-result" }] },
			],
		};
		expect(currentTerminalTarget(view, target)).toBe(target);
	}
});

test("a missing exact attempt retains the initial target", () => {
	expect(currentTerminalTarget({ ...executionViewV1Example, occurrences: [] }, target)).toBe(target);
	expect(currentTerminalTarget(executionViewV1Example, null)).toBeNull();
});
