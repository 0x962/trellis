import { expect, test } from "bun:test";
import type { FlowDoc } from "@trellis/api";
import { advanceFlow } from "./advanceFlow.ts";
import { boxClocks, processLimit } from "./boxClocks.ts";
import { createFlowExecution } from "./createFlowExecution.ts";
import { edge, flowDoc, node } from "./testDoc.ts";
import type { FlowExecution } from "./types.ts";

// An outer box with a long limit holds an inner box with a short limit
// around two agents in order, and a plain group with no limit holds a third.
const doc: FlowDoc = flowDoc(
	[
		node("outer", "group", null, { minutes: 30 }),
		node("inner", "group", "outer", { minutes: 2 }),
		node("first", "agent", "inner"),
		node("second", "agent", "inner"),
		node("free", "group", null),
		node("third", "agent", "free"),
	],
	[edge("first", "second"), edge("outer", "free")],
);
const inner = "root/1/outer/1/inner";
const step = (state: FlowExecution, key: string) => state.steps.find((step) => step.key === key)!;

test("lists the boxes with a limit, innermost first, with the clock of each", () => {
	let state = createFlowExecution(doc, 1000);
	state = advanceFlow(doc, state, { type: "started", key: `${inner}/1/first:step:1` }, 2000);
	const before = boxClocks(doc, state, step(state, `${inner}/1/first`));
	expect(before.map((clock) => [clock.box.id, clock.budgetMs, clock.deadlineAt])).toEqual([
		["inner", 120_000, null],
		["outer", 1_800_000, null],
	]);
	expect(processLimit(before)).toEqual({ deadlineAt: undefined, budgetMs: 120_000 });
	state = advanceFlow(doc, state, { type: "launched", key: `${inner}/1/first:step:1`, at: 17_000 }, 17_100);
	const after = boxClocks(doc, state, step(state, `${inner}/1/first`));
	expect(after.map((clock) => clock.deadlineAt)).toEqual([137_000, 1_817_000]);
	expect(processLimit(after)).toEqual({ deadlineAt: 137_000, budgetMs: undefined });
});

test("a step outside every limited box has no clock", () => {
	let state = createFlowExecution(doc, 1000);
	state = advanceFlow(doc, state, { type: "started", key: `${inner}/1/first:step:1` }, 2000);
	state = advanceFlow(doc, state, { type: "complete", key: `${inner}/1/first:step:1`, output: "a" }, 3000);
	state = advanceFlow(doc, state, { type: "started", key: `${inner}/1/second:step:1` }, 4000);
	state = advanceFlow(doc, state, { type: "complete", key: `${inner}/1/second:step:1`, output: "b" }, 5000);
	expect(boxClocks(doc, state, step(state, "root/1/free/1/third"))).toEqual([]);
	expect(processLimit([])).toEqual({ deadlineAt: undefined, budgetMs: undefined });
});
