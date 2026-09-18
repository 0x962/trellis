import { expect, test } from "bun:test";
import type { FlowDoc } from "@trellis/api";
import { advanceFlow } from "./advanceFlow.ts";
import { createFlowExecution } from "./createFlowExecution.ts";
import { describeTaskFailure } from "./describeTaskFailure.ts";
import { flowDoc, node } from "./testDoc.ts";

// An outer box with a long limit holds an inner box with a short limit
// around one agent.
const doc: FlowDoc = flowDoc(
	[
		node("outer", "group", null, { minutes: 30 }),
		node("inner", "group", "outer", { minutes: 2 }),
		node("summary", "agent", "inner"),
	],
	[],
);
const summaryKey = "root/1/outer/1/inner/1/summary";

test("names the box with the earliest time limit", () => {
	const state = advanceFlow(
		doc,
		createFlowExecution(doc, 1000),
		{ type: "started", key: `${summaryKey}:step:1` },
		2000,
	);
	const step = state.steps.find((step) => step.key === summaryKey)!;
	expect(describeTaskFailure(doc, state, step, "Process timed out after 104572 ms")).toBe(
		"Group inner reached its time limit (2 min)",
	);
});

test("keeps every other error as it is", () => {
	const state = createFlowExecution(doc, 1000);
	const step = state.steps.find((step) => step.key === summaryKey)!;
	expect(describeTaskFailure(doc, state, step, "The flow worker failed")).toBe("The flow worker failed");
});

test("keeps the runtime text when no box has a limit", () => {
	const plain: FlowDoc = flowDoc([node("box", "group", null), node("summary", "agent", "box")], []);
	const state = createFlowExecution(plain, 1000);
	const step = state.steps.find((step) => step.key === "root/1/box/1/summary")!;
	expect(describeTaskFailure(plain, state, step, "Process timed out after 5 ms")).toBe("Process timed out after 5 ms");
});
