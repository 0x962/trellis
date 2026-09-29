import { expect, test } from "bun:test";
import { FlowExecutionViewV1Schema, flowV1FixtureIds as ids } from "@trellis/api";
import { fixture } from "./fixture.ts";
import { projectView } from "./projectView.ts";

test("retains identities, frozen graph, unknown association, output, and historical feedback", () => {
	const record = fixture();
	const before = structuredClone(record);
	const view = projectView(record, JSON.stringify(record.doc));
	expect(FlowExecutionViewV1Schema.parse(view)).toEqual(view);
	expect(view.id).toBe(record.id);
	expect(view.ticketId).toBe(record.ticketId);
	expect(view.diffId).toBeNull();
	expect(view.reviewedHead).toBe("reviewed-head");
	expect(view.snapshot.flow).toEqual(record.doc.flow);
	expect(view.snapshot.revision).toBe(2);
	expect(view.revision).toBe(12);
	expect(view.snapshot.graphDocument).toEqual({ nodes: record.doc.nodes, edges: record.doc.edges });
	expect(view.failureKind).toBe("feedback");
	expect(view.occurrences[0]!.output).toBe(record.state.steps[0]!.output);
	expect(view.occurrences[0]!.startedAt).toBeNull();
	expect(view.occurrences[0]!.endedAt).toBeNull();
	expect(view.publication).toBeNull();
	expect(view.submission).toBeNull();
	expect(view.decisionDeliveries).toEqual([]);
	expect(record).toEqual(before);
});

test("classifies historical errors and loop feedback without a scheduler", () => {
	const record = fixture();
	record.doc.nodes[0]!.kind = "agent";
	expect(projectView(record, JSON.stringify(record.doc)).failureKind).toBe("error");
	record.doc.nodes[0]!.kind = "loop";
	record.state.steps[0]!.phase = "condition";
	record.state.steps[0]!.decision = "no";
	expect(projectView(record, JSON.stringify(record.doc)).failureKind).toBe("feedback");
	record.state.failureKind = "error";
	expect(projectView(record, JSON.stringify(record.doc)).failureKind).toBe("error");
	record.state.status = "succeeded";
	expect(projectView(record, JSON.stringify(record.doc)).failureKind).toBeNull();
});

test("keeps all condition task links after a loop advances beyond former round cutoffs", () => {
	const record = fixture();
	const step = record.state.steps[0]!;
	record.doc.nodes[0]!.kind = "loop";
	step.phase = "condition";
	step.round = 71;
	step.decision = "no";
	record.tasks = [1, 70, 71].map((round) => ({
		key: `${step.key}:condition:${round}`,
		runId: ids.agentRun,
		attemptId: `attempt-${round}`,
		resultId: `result-${round}`,
	}));
	const view = projectView(record, JSON.stringify(record.doc));
	expect(view.occurrences[0]!.actionKey).toBe(`${step.key}:condition:71`);
	expect(view.occurrences[0]!.iterationPath).toEqual([{ loopNodeId: ids.node, round: 71 }]);
	expect(view.occurrences[0]!.attempts.map((attempt) => [attempt.stepId, attempt.attemptId, attempt.resultId])).toEqual(
		record.tasks.map((task) => [task.key, task.attemptId, task.resultId]),
	);
	expect(view.occurrences[0]!.attempts.every((attempt) => attempt.workspaceCommit === null)).toBe(true);
	expect(FlowExecutionViewV1Schema.safeParse(view).success).toBe(true);
});

test("uses each child's retained iteration for nested loops and keeps group deadlines", () => {
	const record = fixture();
	const outer = record.state.steps[0]!;
	const outerNode = record.doc.nodes[0]!;
	outerNode.kind = "loop";
	outerNode.minutes = 90;
	outer.round = 72;
	outer.deadlineAt = Date.parse(record.createdAt) + 90 * 60_000;
	const innerNode = { ...outerNode, id: ids.edge, parentId: outerNode.id, minutes: null };
	const inner = {
		...outer,
		key: `${outer.key}/51/${innerNode.id}`,
		nodeId: innerNode.id,
		parentKey: outer.key,
		iteration: 51,
		round: 63,
		deadlineAt: null,
	};
	const leafNode = { ...innerNode, id: ids.publication, parentId: innerNode.id, kind: "agent" as const };
	const leaf = {
		...inner,
		key: `${inner.key}/60/${leafNode.id}`,
		nodeId: leafNode.id,
		parentKey: inner.key,
		iteration: 60,
		round: 1,
	};
	record.doc.nodes.push(innerNode, leafNode);
	record.state.steps.push(inner, leaf);
	const view = projectView(record, JSON.stringify(record.doc));
	expect(view.occurrences[2]!.iterationPath).toEqual([
		{ loopNodeId: outerNode.id, round: 51 },
		{ loopNodeId: innerNode.id, round: 60 },
	]);
	expect(view.occurrences[2]!.deadlineRefs).toEqual([outer.key]);
	expect(view.deadlines[0]!.launchedAt).toBe(record.createdAt);
	expect(FlowExecutionViewV1Schema.safeParse(view).success).toBe(true);
});

test("reports missing stop receipt times without inventing a receipt", () => {
	const record = fixture();
	record.state.steps[0]!.needsStop = true;
	const view = projectView(record, JSON.stringify(record.doc));
	expect(view.snapshot.diagnostics[0]!.code).toBe("LEGACY_STOP_TIME_UNKNOWN");
	expect(view.stopObligations).toEqual([]);
	expect(record.state.steps[0]!.needsStop).toBe(true);
});

test("retains more than 500 occurrences and output beyond former text cutoffs", () => {
	const record = fixture();
	const step = record.state.steps[0]!;
	const output = "α\n".repeat(100_001);
	record.state.steps = Array.from({ length: 501 }, (_, index) => ({
		...step,
		key: `root/${index + 1}/${step.nodeId}`,
		output,
	}));
	const view = projectView(record, JSON.stringify(record.doc));
	expect(view.occurrences).toHaveLength(501);
	expect(view.occurrences[500]!.output).toBe(output);
});

test("binds output only to the exact retained result of its current action", () => {
	const record = fixture();
	const step = record.state.steps[0]!;
	record.doc.nodes[0]!.kind = "loop";
	step.phase = "condition";
	step.round = 2;
	record.tasks = [
		{ key: `${step.key}:condition:1`, runId: ids.agentRun, attemptId: "old-attempt", resultId: "old-result" },
	];
	expect(projectView(record, JSON.stringify(record.doc)).occurrences[0]).toMatchObject({
		kind: "loop",
		outputSource: null,
	});
	record.tasks.push({
		key: `${step.key}:condition:2`,
		runId: ids.agentRun,
		attemptId: "exact-attempt",
		resultId: "exact-result",
	});
	expect(projectView(record, JSON.stringify(record.doc)).occurrences[0]).toMatchObject({
		outputSource: {
			stepId: `${step.key}:condition:2`,
			agentRunId: ids.agentRun,
			attemptId: "exact-attempt",
			resultId: "exact-result",
		},
	});
	step.output = null;
	expect(projectView(record, JSON.stringify(record.doc)).occurrences[0]).toMatchObject({ outputSource: null });
});
