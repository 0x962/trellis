import { expect, test } from "bun:test";
import type { AgentSubagentObservation } from "@trellis/api";
import { mergeSubagentObservations } from "./whiteboardSubagents";

const spawn: Extract<AgentSubagentObservation, { kind: "spawn" }> = {
	kind: "spawn",
	parentRunId: "parent",
	attemptId: "attempt",
	toolCallId: "call",
	observedAt: "2026-10-10T10:00:00Z",
	provider: "codex",
	providerChildIds: ["child"],
	prompt: "Inspect the change",
	output: null,
	state: "started",
};
const status: Extract<AgentSubagentObservation, { kind: "status" }> = {
	kind: "status",
	parentRunId: "parent",
	attemptId: "attempt",
	providerChildId: "child",
	observedAt: "2026-10-10T10:01:00Z",
	state: "completed",
	output: "Review finished",
};

test("partial history and older pages retain the newer result", () => {
	const complete = mergeSubagentObservations([], [spawn, status]);
	const refreshed = mergeSubagentObservations(complete, [
		{ ...spawn, prompt: null },
		{ ...status, observedAt: spawn.observedAt, state: "running", output: null },
	]);
	expect(refreshed).toEqual(complete);
	expect(mergeSubagentObservations(refreshed, [])).toEqual(complete);
});

test("only an explicit child ID of the same parent receives a status update", () => {
	const result = mergeSubagentObservations(
		[],
		[spawn, { ...status, parentRunId: "other-parent" }, { ...status, providerChildId: "other-child" }],
	);
	expect(result).toHaveLength(1);
	expect(result[0]!.state).toBe("started");
	expect(mergeSubagentObservations([], [status])).toEqual([]);
});

test("tool calls in separate attempts stay distinct and late spawn metadata fills missing fields", () => {
	const first = mergeSubagentObservations(
		[],
		[
			{
				...spawn,
				prompt: null,
				providerChildIds: [],
				state: "result-recorded",
				output: "Done",
				observedAt: status.observedAt,
			},
		],
	);
	const result = mergeSubagentObservations(first, [spawn, { ...spawn, attemptId: "next-attempt" }]);
	expect(result).toHaveLength(2);
	expect(result[0]!.prompt).toBe(spawn.prompt);
	expect(result[0]!.providerChildIds).toEqual(["child"]);
	expect(result[0]!.output).toBe("Done");
});
