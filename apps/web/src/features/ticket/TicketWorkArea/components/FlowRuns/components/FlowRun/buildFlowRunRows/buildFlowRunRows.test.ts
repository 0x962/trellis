import { expect, test } from "bun:test";
import type { FlowEdge, FlowExecutionRecord, FlowNode } from "@trellis/api";
import { buildFlowRunRows, scopeOrder } from "./buildFlowRunRows";

type Step = FlowExecutionRecord["state"]["steps"][number];

const node = (
	id: string,
	kind: FlowNode["kind"],
	parentId: string | null,
	fields: Partial<Pick<FlowNode, "parallel" | "minutes" | "maxRounds" | "title" | "x" | "y">> = {},
): FlowNode => ({
	id,
	parentId,
	kind,
	title: id,
	instruction: "Do the step",
	parallel: false,
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
	...fields,
});
const edge = (fromNodeId: string, toNodeId: string, branch: FlowEdge["branch"] = "out"): FlowEdge => ({
	id: `${fromNodeId}-${branch}-${toNodeId}`,
	fromNodeId,
	toNodeId,
	branch,
});
const step = (key: string, parentKey: string | null, fields: Partial<Step> = {}): Step => ({
	key,
	actionKey: `${key}:step:1`,
	nodeId: key.slice(key.lastIndexOf("/") + 1),
	parentKey,
	iteration: 1,
	round: 1,
	state: "pending",
	phase: "step",
	output: null,
	decision: null,
	error: null,
	startedAt: null,
	endedAt: null,
	deadlineAt: null,
	needsStop: false,
	...fields,
});

// The review flow in small: a budget box with the summary step, then a
// parallel box with two review lanes. Each lane asks a gate and runs its
// checks on yes.
const doc: FlowExecutionRecord["doc"] = {
	flow: {
		id: "flow",
		slug: "review",
		name: "Review",
		description: "",
		briefing: "",
		version: 34,
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	},
	nodes: [
		node("review", "group", null),
		node("budget", "group", "review", { title: "New budget", minutes: 2, y: 0 }),
		node("summary", "agent", "budget"),
		node("parallel", "group", "review", { parallel: true, y: 100 }),
		node("backend", "group", "parallel", { x: 200 }),
		node("backendGate", "gate", "backend"),
		node("backendChecks", "group", "backend", { parallel: true }),
		node("migrations", "agent", "backendChecks", { x: 0 }),
		node("logging", "agent", "backendChecks", { x: 100 }),
		node("frontend", "group", "parallel", { x: 0 }),
		node("frontendGate", "gate", "frontend"),
		node("frontendChecks", "group", "frontend", { parallel: true }),
		node("tokens", "agent", "frontendChecks"),
	],
	edges: [
		edge("budget", "parallel"),
		edge("backendGate", "backendChecks", "yes"),
		edge("frontendGate", "frontendChecks", "yes"),
	],
};
const timeout = "Group New budget reached its time limit (2 min)";
const record = (steps: Step[], tasks: FlowExecutionRecord["tasks"] = []): FlowExecutionRecord => ({
	id: "execution",
	flowId: "flow",
	ticketId: "ticket",
	projectId: "project",
	revision: 3,
	doc,
	state: {
		version: 1,
		flowId: "flow",
		flowVersion: 34,
		status: "failed",
		startedAt: 1000,
		updatedAt: 5000,
		error: timeout,
		steps,
	},
	tasks,
	createdAt: "2026-09-18T00:00:01.000Z",
	updatedAt: "2026-09-18T00:00:05.000Z",
});

// The failed run: the summary ran out of its budget before the parallel box started.
const failed = record(
	[
		step("root/1/review", null, { state: "canceled", phase: "children", startedAt: 1000, endedAt: 5000 }),
		step("root/1/review/1/budget", "root/1/review", {
			state: "failed",
			phase: "children",
			error: timeout,
			startedAt: 1000,
			endedAt: 5000,
			deadlineAt: 121_000,
		}),
		step("root/1/review/1/budget/1/summary", "root/1/review/1/budget", {
			state: "failed",
			error: timeout,
			startedAt: 2000,
			endedAt: 5000,
		}),
		step("root/1/review/1/parallel", "root/1/review", { state: "canceled", endedAt: 5000 }),
	],
	[{ key: "root/1/review/1/budget/1/summary:step:1", runId: "run", attemptId: "attempt", resultId: null }],
);

test("orders the whole saved graph in run order with a row per node", () => {
	const rows = buildFlowRunRows(failed);
	expect(rows.map((row) => `${row.depth}:${row.title}`)).toEqual([
		"0:review",
		"1:Group",
		"2:summary",
		"1:parallel",
		"2:frontend",
		"3:frontendGate",
		"3:frontendChecks",
		"4:tokens",
		"2:backend",
		"3:backendGate",
		"3:backendChecks",
		"4:migrations",
		"4:logging",
	]);
});

test("shows the steps of a box that never started as not started", () => {
	const rows = buildFlowRunRows(failed);
	const tokens = rows.find((row) => row.title === "tokens")!;
	expect(tokens).toMatchObject({ state: "not_started", actionKey: null, terminal: false, startedAt: null });
	expect(rows.find((row) => row.title === "parallel")).toMatchObject({
		state: "canceled",
		meta: "2 at the same time",
		parentKey: "root/1/review",
	});
});

test("puts the error on the failed step and only the limit on its box", () => {
	const rows = buildFlowRunRows(failed);
	expect(rows.find((row) => row.title === "Group")).toMatchObject({
		state: "failed",
		error: null,
		meta: "1 in order · 2 min limit",
		deadlineAt: 121_000,
	});
	expect(rows.find((row) => row.title === "summary")).toMatchObject({
		state: "failed",
		error: timeout,
		terminal: true,
		actionKey: "root/1/review/1/budget/1/summary:step:1",
		startedAt: 2000,
		endedAt: 5000,
	});
});

test("names the gate answer on a skipped branch", () => {
	const lane = "root/1/review/1/parallel/1/backend";
	const rows = buildFlowRunRows(
		record([
			step("root/1/review", null, { state: "running", phase: "children", startedAt: 1000 }),
			step("root/1/review/1/budget", "root/1/review", {
				state: "succeeded",
				phase: "children",
				startedAt: 1000,
				endedAt: 3000,
			}),
			step("root/1/review/1/budget/1/summary", "root/1/review/1/budget", {
				state: "succeeded",
				output: "A summary",
				startedAt: 1000,
				endedAt: 3000,
			}),
			step("root/1/review/1/parallel", "root/1/review", { state: "running", phase: "children", startedAt: 3000 }),
			step(lane, "root/1/review/1/parallel", { state: "succeeded", phase: "children", startedAt: 3000, endedAt: 4000 }),
			step(`${lane}/1/backendGate`, lane, {
				state: "succeeded",
				decision: "no",
				output: "NO",
				startedAt: 3000,
				endedAt: 4000,
			}),
			step(`${lane}/1/backendChecks`, lane, { state: "skipped", phase: "children" }),
			step(`${lane}/1/backendChecks/1/migrations`, `${lane}/1/backendChecks`, { state: "skipped" }),
			step(`${lane}/1/backendChecks/1/logging`, `${lane}/1/backendChecks`, { state: "skipped" }),
			step("root/1/review/1/parallel/1/frontend", "root/1/review/1/parallel", {
				state: "running",
				phase: "children",
				startedAt: 3000,
			}),
			step("root/1/review/1/parallel/1/frontend/1/frontendGate", "root/1/review/1/parallel/1/frontend", {
				state: "running",
				startedAt: 3000,
			}),
			step("root/1/review/1/parallel/1/frontend/1/frontendChecks", "root/1/review/1/parallel/1/frontend"),
		]),
	);
	expect(rows.find((row) => row.title === "backendGate")).toMatchObject({
		state: "succeeded",
		meta: "No",
		output: null,
	});
	expect(rows.find((row) => row.title === "backendChecks")).toMatchObject({
		state: "skipped",
		meta: "backendGate answered No",
	});
	expect(rows.find((row) => row.title === "summary")).toMatchObject({ output: "A summary" });
	expect(rows.find((row) => row.title === "frontendChecks")).toMatchObject({ state: "pending" });
});

test("orders a sequential box along its wires with yes before no", () => {
	const branches: FlowExecutionRecord["doc"] = {
		...doc,
		nodes: [
			node("gate", "gate", null, { y: 0 }),
			node("no", "agent", null, { y: 50 }),
			node("yes", "agent", null, { y: 100 }),
			node("join", "agent", null, { y: 150 }),
		],
		edges: [edge("gate", "yes", "yes"), edge("gate", "no", "no"), edge("yes", "join"), edge("no", "join")],
	};
	expect(scopeOrder(branches, null).map((item) => item.id)).toEqual(["gate", "yes", "no", "join"]);
});
