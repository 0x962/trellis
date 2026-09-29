import { expect, test } from "bun:test";
import { executionViewV1Example, occurrenceV1Example, stopPendingV1Example } from "@trellis/api";
import { buildExecutionViewRows } from "./buildExecutionViewRows";

test("retains every round and exact attempt beyond round 50", () => {
	const occurrences = Array.from({ length: 51 }, (_, index) => ({
		...occurrenceV1Example,
		occurrenceKey: `opaque/${index}:key`,
		parentOccurrenceKey: null,
		iterationPath: [
			{ loopNodeId: "outer", round: index + 1 },
			{ loopNodeId: "inner", round: 2 },
		],
		attempts: [1, 2].map((attempt) => ({
			...occurrenceV1Example.attempts[0]!,
			attemptId: `attempt-${index}-${attempt}`,
			resultId: `result-${index}-${attempt}`,
		})),
	}));
	const rows = buildExecutionViewRows({ ...executionViewV1Example, occurrences });
	expect(rows).toHaveLength(153);
	expect(new Set(rows.map((row) => row.key)).size).toBe(153);
	expect(rows.at(-1)?.attempt?.attemptId).toBe("attempt-50-2");
	expect(rows.at(-3)?.meta).toContain("outer: round 51 / inner: round 2");
	expect(rows.at(-3)?.occurrence).toBe(occurrences[50]);
});

test("keeps occurrence output separate from attempts and preserves unknown kind", () => {
	const occurrence = {
		...occurrenceV1Example,
		kind: null,
		parentOccurrenceKey: null,
		output: "x".repeat(300_000),
		outputSource: null,
	};
	const rows = buildExecutionViewRows({ ...executionViewV1Example, occurrences: [occurrence] });
	expect(rows[0]?.kind).toBeNull();
	expect(rows[0]?.meta).toContain("Output source unknown");
	expect(rows[0]?.output).toBe(occurrence.output);
	expect(rows[1]?.output).toBeNull();
	expect(rows[1]?.meta).toContain("Workspace commit unknown");
});

test("uses the retained output binding even when another attempt follows it", () => {
	const first = { ...occurrenceV1Example.attempts[0]!, resultId: "first-result" };
	const occurrence = {
		...occurrenceV1Example,
		parentOccurrenceKey: null,
		output: "First output",
		outputSource: {
			stepId: first.stepId,
			agentRunId: first.agentRunId,
			attemptId: first.attemptId,
			resultId: first.resultId,
		},
		attempts: [first, { ...first, attemptId: "later-attempt", resultId: "later-result" }],
	};
	const rows = buildExecutionViewRows({ ...executionViewV1Example, occurrences: [occurrence] });
	expect(rows[0]?.meta).toContain("Result first-result");
	expect(rows[0]?.meta).not.toContain("later-result");
	expect(rows[2]?.attempt?.resultId).toBe("later-result");
});

test("shows each outstanding stop even when its occurrence is unavailable", () => {
	const pending = stopPendingV1Example.stopObligations[0]!;
	const execution = {
		...executionViewV1Example,
		occurrences: [],
		stopObligations: [
			pending,
			{ ...pending, attemptId: "unknown-attempt", state: "ownership_unknown" as const, confirmedAt: null },
			{
				...pending,
				attemptId: "confirmed-attempt",
				state: "confirmed" as const,
				confirmedAt: executionViewV1Example.updatedAt,
			},
		],
	};
	const rows = buildExecutionViewRows(execution);
	expect(rows).toHaveLength(2);
	expect(rows.map((row) => row.stop?.attemptId)).toEqual([pending.attemptId, "unknown-attempt"]);
});

test("orders parents before children without parsing opaque occurrence keys", () => {
	const parent = { ...occurrenceV1Example, occurrenceKey: "parent/:[]", parentOccurrenceKey: null, attempts: [] };
	const child = {
		...occurrenceV1Example,
		occurrenceKey: "child",
		parentOccurrenceKey: parent.occurrenceKey,
		attempts: [],
	};
	const rows = buildExecutionViewRows({ ...executionViewV1Example, occurrences: [child, parent] });
	expect(rows.map((row) => row.occurrence?.occurrenceKey)).toEqual([parent.occurrenceKey, child.occurrenceKey]);
	expect(rows[1]?.parentKey).toBe(rows[0]?.key ?? null);
});

test("permits only an undelivered human decision after recovery", () => {
	const occurrence = { ...occurrenceV1Example, state: "waiting_human" as const, waitReason: "human" as const };
	const execution = { ...executionViewV1Example, occurrences: [occurrence] };
	expect(buildExecutionViewRows(execution)[0]?.decidable).toBe(false);
	expect(buildExecutionViewRows(execution, true)[0]?.decidable).toBe(true);
	expect(
		buildExecutionViewRows({ ...execution, occurrences: [{ ...occurrence, waitReason: "native" }] }, true)[0]
			?.decidable,
	).toBe(false);
});
