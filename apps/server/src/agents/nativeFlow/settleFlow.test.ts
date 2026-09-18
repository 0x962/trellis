import { expect, test } from "bun:test";
import type { FlowDoc } from "@trellis/api";
import { advanceFlow } from "./advanceFlow.ts";
import { createFlowExecution } from "./createFlowExecution.ts";
import { edge, flowDoc, node } from "./testDoc.ts";
import type { FlowExecution } from "./types.ts";

// A box with a two minute limit around one agent, then a second agent after
// the box.
const doc: FlowDoc = flowDoc(
	[node("box", "group", null, { minutes: 2 }), node("summary", "agent", "box"), node("checks", "agent", null)],
	[edge("box", "checks")],
);
const summaryKey = "root/1/box/1/summary";
const step = (state: FlowExecution, key: string) => state.steps.find((step) => step.key === key)!;
const running = () =>
	advanceFlow(doc, createFlowExecution(doc, 1000), { type: "started", key: `${summaryKey}:step:1` }, 2000);

test("a failed child fails its box, then the run, and cancels the steps after the box", () => {
	const state = advanceFlow(doc, running(), { type: "fail", key: `${summaryKey}:step:1`, error: "It broke" }, 3000);
	expect(state.status).toBe("failed");
	expect(state.error).toBe("It broke");
	expect(step(state, "root/1/box")).toMatchObject({ state: "failed", error: "It broke", endedAt: 3000 });
	expect(step(state, summaryKey)).toMatchObject({ state: "failed", endedAt: 3000 });
	expect(step(state, "root/1/checks")).toMatchObject({ state: "canceled", startedAt: null, endedAt: 3000 });
});

test("a box past its time limit fails with its limit in minutes", () => {
	const state = advanceFlow(doc, running(), { type: "tick" }, 1000 + 120_000);
	expect(state.status).toBe("failed");
	expect(step(state, "root/1/box")).toMatchObject({
		state: "failed",
		error: "Group box reached its time limit (2 min)",
	});
	expect(step(state, summaryKey)).toMatchObject({ state: "canceled", needsStop: true });
});

test("a finished step keeps the time it became final", () => {
	const state = advanceFlow(doc, running(), { type: "complete", key: `${summaryKey}:step:1`, output: "Done" }, 4000);
	expect(state.status).toBe("running");
	expect(step(state, summaryKey)).toMatchObject({ state: "succeeded", startedAt: 2000, endedAt: 4000 });
	expect(step(state, "root/1/box")).toMatchObject({ state: "succeeded", endedAt: 4000, output: "Done" });
	expect(step(state, "root/1/checks")).toMatchObject({ state: "ready", endedAt: null });
});
