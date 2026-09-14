import { expect, test } from "bun:test";
import type { FlowDoc, FlowNode } from "@trellis/api";
import { advanceFlow } from "./advanceFlow.ts";
import { createFlowExecution } from "./createFlowExecution.ts";
import { pendingFlowActions } from "./pendingFlowActions.ts";
import type { FlowEvent, FlowExecution } from "./types.ts";

const node = (id: string, kind: FlowNode["kind"] = "agent", extra: Partial<FlowNode> = {}): FlowNode => ({
	id,
	parentId: null,
	kind,
	title: id,
	personaId: null,
	instruction: `Do ${id}`,
	parallel: false,
	minutes: null,
	maxRounds: kind === "loop" ? 2 : null,
	x: 0,
	y: 0,
	width: null,
	height: null,
	...extra,
});
const doc = (nodes: FlowNode[], edges: [string, string, "out" | "yes" | "no"][] = []): FlowDoc => ({
	flow: {
		id: "flow",
		slug: "flow",
		name: "Flow",
		description: "",
		briefing: "Shared instructions",
		version: 1,
		createdAt: "2026-09-14T00:00:00Z",
		updatedAt: "2026-09-14T00:00:00Z",
	},
	nodes,
	edges: edges.map(([fromNodeId, toNodeId, branch], i) => ({ id: `edge-${i}`, fromNodeId, toNodeId, branch })),
});
const names = (d: FlowDoc, s: FlowExecution) =>
	pendingFlowActions(d, s)
		.filter((a) => a.type !== "cancel")
		.map((a) => a.nodeId);
function complete(d: FlowDoc, s: FlowExecution, nodeId: string, decision?: "yes" | "no") {
	const action = pendingFlowActions(d, s).find((a) => a.nodeId === nodeId)!;
	s = advanceFlow(d, s, { type: "started", key: action.key }, 10);
	return advanceFlow(d, s, { type: "complete", key: action.key, output: `${nodeId} output`, decision }, 20);
}
test("a chain dispatches one ordinary assignment and retains its input", () => {
	const d = doc([node("a"), node("b")], [["a", "b", "out"]]);
	let s = createFlowExecution(d, 0);
	expect(names(d, s)).toEqual(["a"]);
	s = complete(d, s, "a");
	expect(names(d, s)).toEqual(["b"]);
	expect(pendingFlowActions(d, s)[0]?.inputs[0]?.output).toBe("a output");
	expect(complete(d, s, "b").status).toBe("succeeded");
});
test("parallel joins wait for every predecessor", () => {
	const d = doc(
		[node("a"), node("b"), node("join")],
		[
			["a", "join", "out"],
			["b", "join", "out"],
		],
	);
	let s = createFlowExecution(d, 0);
	expect(names(d, s)).toEqual(["a", "b"]);
	s = complete(d, s, "a");
	expect(names(d, s)).toEqual(["b"]);
	s = complete(d, s, "b");
	expect(names(d, s)).toEqual(["join"]);
	expect(pendingFlowActions(d, s)[0]?.inputs).toHaveLength(2);
});
test("an unselected gate path is skipped and a join receives the selected path", () => {
	const d = doc(
		[node("gate", "gate"), node("yes"), node("no"), node("join")],
		[
			["gate", "yes", "yes"],
			["gate", "no", "no"],
			["yes", "join", "out"],
			["no", "join", "out"],
		],
	);
	let s = complete(d, createFlowExecution(d, 0), "gate", "yes");
	expect(names(d, s)).toEqual(["yes"]);
	expect(s.steps.find((n) => n.nodeId === "no")?.state).toBe("skipped");
	s = complete(d, s, "yes");
	expect(names(d, s)).toEqual(["join"]);
	expect(pendingFlowActions(d, s)[0]?.inputs.map((i) => i.nodeId)).toEqual(["yes"]);
});
test("human steps wait for an explicit decision", () => {
	const d = doc([node("human", "human"), node("after")], [["human", "after", "out"]]);
	const s = createFlowExecution(d, 0);
	const action = pendingFlowActions(d, s)[0]!;
	expect(s.status).toBe("waiting");
	expect(action.type).toBe("human");
	expect(
		names(d, advanceFlow(d, s, { type: "human", key: action.key, approved: true, output: "Approved" }, 10)),
	).toEqual(["after"]);
	expect(advanceFlow(d, s, { type: "human", key: action.key, approved: false, output: "Rejected" }, 10).status).toBe(
		"failed",
	);
});
test("a connected group exposes output only after its children complete", () => {
	const d = doc(
		[
			node("group", "group"),
			node("a", "agent", { parentId: "group" }),
			node("b", "agent", { parentId: "group" }),
			node("after"),
		],
		[
			["a", "b", "out"],
			["group", "after", "out"],
		],
	);
	let s = createFlowExecution(d, 0);
	expect(names(d, s)).toEqual(["a"]);
	s = complete(d, s, "a");
	expect(names(d, s)).toEqual(["b"]);
	s = complete(d, s, "b");
	expect(names(d, s)).toEqual(["after"]);
});
test("parallel groups start every child and join at their boundary", () => {
	const d = doc(
		[
			node("group", "group", { parallel: true }),
			node("a", "agent", { parentId: "group" }),
			node("b", "agent", { parentId: "group" }),
			node("after"),
		],
		[["group", "after", "out"]],
	);
	let s = createFlowExecution(d, 0);
	expect(names(d, s)).toEqual(["a", "b"]);
	s = complete(d, s, "a");
	expect(names(d, s)).toEqual(["b"]);
	s = complete(d, s, "b");
	expect(names(d, s)).toEqual(["after"]);
});
test("a loop asks its exit question after each round with distinct task keys", () => {
	const d = doc(
		[node("loop", "loop"), node("work", "agent", { parentId: "loop" }), node("after")],
		[["loop", "after", "out"]],
	);
	let s = createFlowExecution(d, 0);
	const first = pendingFlowActions(d, s)[0]!.key;
	s = complete(d, s, "work");
	expect(pendingFlowActions(d, s)[0]?.purpose).toBe("loop-condition");
	s = complete(d, s, "loop", "no");
	expect(names(d, s)).toEqual(["work"]);
	expect(pendingFlowActions(d, s)[0]!.key).not.toBe(first);
	s = complete(d, s, "work");
	s = complete(d, s, "loop", "yes");
	expect(names(d, s)).toEqual(["after"]);
});
test("a loop stops at its round limit and retains the reason", () => {
	const d = doc([node("loop", "loop", { maxRounds: 1 }), node("work", "agent", { parentId: "loop" })]);
	let s = complete(d, createFlowExecution(d, 0), "work");
	s = complete(d, s, "loop", "no");
	expect(s.status).toBe("failed");
	expect(s.error).toContain("round limit");
	expect(names(d, s)).toEqual([]);
});
test("a group deadline cancels active work and does not release successors", () => {
	const d = doc(
		[node("group", "group", { minutes: 1 }), node("work", "agent", { parentId: "group" }), node("after")],
		[["group", "after", "out"]],
	);
	let s = createFlowExecution(d, 0);
	const key = pendingFlowActions(d, s)[0]!.key;
	s = advanceFlow(d, s, { type: "started", key }, 10);
	s = advanceFlow(d, s, { type: "tick" }, 60000);
	expect(s.status).toBe("failed");
	expect(pendingFlowActions(d, s)).toEqual([expect.objectContaining({ type: "cancel", key })]);
	expect(s.steps.find((n) => n.nodeId === "after")?.state).toBe("canceled");
});
test("a persisted unknown task never creates another assignment", () => {
	const d = doc([node("work")]);
	let s = createFlowExecution(d, 0);
	const key = pendingFlowActions(d, s)[0]!.key;
	s = advanceFlow(d, s, { type: "started", key }, 10);
	s = advanceFlow(d, s, { type: "unknown", key, error: "Connection lost" }, 20);
	s = advanceFlow(d, JSON.parse(JSON.stringify(s)), { type: "tick" }, 30);
	expect(s.status).toBe("waiting");
	expect(pendingFlowActions(d, s)).toEqual([]);
	s = advanceFlow(d, s, { type: "complete", key, output: "Observed later" }, 40);
	expect(s.status).toBe("succeeded");
});
test("a repeated completion does not release a step twice", () => {
	const d = doc([node("work")]);
	let s = createFlowExecution(d, 0);
	const key = pendingFlowActions(d, s)[0]!.key;
	s = advanceFlow(d, s, { type: "started", key }, 10);
	const event: FlowEvent = { type: "complete", key, output: "Done" };
	s = advanceFlow(d, s, event, 20);
	expect(advanceFlow(d, s, event, 20)).toEqual(s);
});
test("an entry child receives the enclosing group inputs", () => {
	const d = doc(
		[node("before"), node("group", "group"), node("child", "agent", { parentId: "group" })],
		[["before", "group", "out"]],
	);
	const s = complete(d, createFlowExecution(d, 0), "before");
	expect(pendingFlowActions(d, s)[0]?.inputs.map((input) => input.output)).toEqual(["before output"]);
});
test("a repeated loop round receives the previous round output", () => {
	const d = doc([node("loop", "loop"), node("work", "agent", { parentId: "loop" })]);
	let s = complete(d, createFlowExecution(d, 0), "work");
	s = complete(d, s, "loop", "no");
	expect(pendingFlowActions(d, s)[0]?.inputs.map((input) => input.output)).toContain("work output");
});
test("a skipped group marks every nested child skipped", () => {
	const d = doc(
		[
			node("gate", "gate"),
			node("group", "group"),
			node("nested", "group", { parentId: "group" }),
			node("child", "agent", { parentId: "nested" }),
			node("selected"),
		],
		[
			["gate", "group", "no"],
			["gate", "selected", "yes"],
		],
	);
	const s = complete(d, createFlowExecution(d, 0), "gate", "yes");
	expect(
		s.steps.filter((step) => ["group", "nested", "child"].includes(step.nodeId)).map((step) => step.state),
	).toEqual(["skipped", "skipped", "skipped"]);
	expect(names(d, s)).toEqual(["selected"]);
});
test("cancel retains a stop action until the attempt confirms exit", () => {
	const d = doc([node("work")]);
	let s = createFlowExecution(d, 0);
	const key = pendingFlowActions(d, s)[0]!.key;
	s = advanceFlow(d, s, { type: "started", key }, 10);
	s = advanceFlow(d, s, { type: "cancel", reason: "User stopped flow" }, 20);
	expect(s.status).toBe("canceled");
	expect(pendingFlowActions(d, s)[0]?.type).toBe("cancel");
	s = advanceFlow(d, s, { type: "stopped", key }, 30);
	expect(pendingFlowActions(d, s)).toEqual([]);
});
