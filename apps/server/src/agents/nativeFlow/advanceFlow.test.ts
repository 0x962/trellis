import { expect, test } from "bun:test";
import type { FlowDoc } from "@trellis/api";
import { advanceFlow } from "./advanceFlow.ts";
import { createFlowExecution } from "./createFlowExecution.ts";
import { taskKey } from "./taskKey.ts";
import { edge, flowDoc, node } from "./testDoc.ts";
import type { FlowExecution } from "./types.ts";

// An outer box with a long limit holds an inner box with a short limit
// around two agents in order.
const doc: FlowDoc = flowDoc(
	[
		node("outer", "group", null, { minutes: 30 }),
		node("inner", "group", "outer", { minutes: 2 }),
		node("first", "agent", "inner"),
		node("second", "agent", "inner"),
	],
	[edge("first", "second")],
);
const inner = "root/1/outer/1/inner";
const step = (state: FlowExecution, key: string) => state.steps.find((step) => step.key === key)!;

test("a box has no clock until the first worker process inside it starts", () => {
	const created = createFlowExecution(doc, 1000);
	expect(step(created, "root/1/outer").deadlineAt).toBeNull();
	expect(step(created, inner).deadlineAt).toBeNull();
	const started = advanceFlow(doc, created, { type: "started", key: `${inner}/1/first:step:1` }, 2000);
	const launched = advanceFlow(doc, started, { type: "launched", key: `${inner}/1/first:step:1`, at: 17_000 }, 17_100);
	expect(step(launched, `${inner}/1/first`).startedAt).toBe(17_000);
	expect(step(launched, inner).deadlineAt).toBe(17_000 + 120_000);
	expect(step(launched, "root/1/outer").deadlineAt).toBe(17_000 + 1_800_000);
});

test("a later launch in the same box keeps the clock that runs", () => {
	let state = createFlowExecution(doc, 1000);
	state = advanceFlow(doc, state, { type: "started", key: `${inner}/1/first:step:1` }, 2000);
	state = advanceFlow(doc, state, { type: "launched", key: `${inner}/1/first:step:1`, at: 17_000 }, 17_100);
	state = advanceFlow(doc, state, { type: "complete", key: `${inner}/1/first:step:1`, output: "Done" }, 40_000);
	state = advanceFlow(doc, state, { type: "started", key: `${inner}/1/second:step:1` }, 41_000);
	state = advanceFlow(doc, state, { type: "launched", key: `${inner}/1/second:step:1`, at: 55_000 }, 55_100);
	expect(step(state, inner).deadlineAt).toBe(17_000 + 120_000);
	expect(step(state, `${inner}/1/second`).startedAt).toBe(55_000);
});

test("a group deadline above the former limit keeps its complete duration", () => {
	const longDoc = flowDoc([node("long", "group", null, { minutes: 1441 }), node("worker", "agent", "long")], []);
	let state = createFlowExecution(longDoc, 1000);
	state = advanceFlow(longDoc, state, { type: "started", key: "root/1/long/1/worker:step:1" }, 2000);
	state = advanceFlow(longDoc, state, { type: "launched", key: "root/1/long/1/worker:step:1", at: 17_000 }, 17_100);

	expect(step(state, "root/1/long").deadlineAt).toBe(17_000 + 1441 * 60_000);
});

test("a loop can start round 51", () => {
	const loopDoc = flowDoc([node("loop", "loop", null, { maxRounds: 51 }), node("worker", "agent", "loop")], []);
	let state = createFlowExecution(loopDoc, 0);
	for (let round = 1; round <= 50; round++) {
		const workerKey = `root/1/loop/${round}/worker:step:1`;
		state = advanceFlow(loopDoc, state, { type: "started", key: workerKey }, round * 10);
		state = advanceFlow(loopDoc, state, { type: "complete", key: workerKey, output: "Done" }, round * 10 + 1);
		const loopKey = taskKey(step(state, "root/1/loop"));
		state = advanceFlow(loopDoc, state, { type: "started", key: loopKey }, round * 10 + 2);
		state = advanceFlow(
			loopDoc,
			state,
			{ type: "complete", key: loopKey, output: "Continue", decision: "no" },
			round * 10 + 3,
		);
	}

	expect(step(state, "root/1/loop")).toMatchObject({ round: 51, phase: "children", state: "running" });
	expect(step(state, "root/1/loop/51/worker")).toMatchObject({ iteration: 51, state: "ready" });
});

test("a launch of a step that is not running changes nothing", () => {
	const created = createFlowExecution(doc, 1000);
	const state = advanceFlow(doc, created, { type: "launched", key: `${inner}/1/second:step:1`, at: 5000 }, 5100);
	expect(step(state, inner).deadlineAt).toBeNull();
	expect(step(state, `${inner}/1/second`).startedAt).toBeNull();
});

test("a warned event keeps the count of time warnings on a running step", () => {
	let state = createFlowExecution(doc, 1000);
	state = advanceFlow(doc, state, { type: "started", key: `${inner}/1/first:step:1` }, 2000);
	state = advanceFlow(doc, state, { type: "warned", key: `${inner}/1/first:step:1`, count: 1 }, 3000);
	expect(step(state, `${inner}/1/first`).timeWarnings).toBe(1);
	const idle = advanceFlow(doc, state, { type: "warned", key: `${inner}/1/second:step:1`, count: 1 }, 4000);
	expect(step(idle, `${inner}/1/second`).timeWarnings).toBeUndefined();
});

test("a human rejection is feedback", () => {
	const doc = flowDoc([node("decision", "human", null)], []);
	const created = createFlowExecution(doc, 0);
	const result = advanceFlow(
		doc,
		created,
		{ type: "human", key: taskKey(created.steps[0]!), approved: false, output: "Fix the findings" },
		1,
	);
	expect(result.failureKind).toBe("feedback");
});

test("a negative agent decision completes without an execution error", () => {
	const doc = flowDoc([node("review", "gate", null)], []);
	const created = createFlowExecution(doc, 0);
	const key = taskKey(created.steps[0]!);
	const started = advanceFlow(doc, created, { type: "started", key }, 1);
	const result = advanceFlow(doc, started, { type: "complete", key, output: "Changes requested", decision: "no" }, 2);
	expect(result.status).toBe("succeeded");
	expect(result.failureKind).toBeUndefined();
});

test("a worker error permits an execution retry", () => {
	const doc = flowDoc([node("review", "agent", null)], []);
	const created = createFlowExecution(doc, 0);
	const key = taskKey(created.steps[0]!);
	const started = advanceFlow(doc, created, { type: "started", key }, 1);
	const result = advanceFlow(doc, started, { type: "fail", key, error: "Provider exited" }, 2);
	expect(result.status).toBe("failed");
	expect(result.failureKind).toBe("error");
});
