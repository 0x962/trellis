import { afterEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { recordLaunch, reserveNative } from "../../../db/queries/langflowExecution";
import { ids, now } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { handle } from "../../../db/queries/langflowExecution/fixtures/native";
import { langflowExecutions, langflowExecutionProjections } from "../../../db/tables/langflowExecution";
import { cancelView } from "../../langflowStops";
import { stopFixture } from "../../langflowTestFixture";
import type { GroupDeadlineScope } from "../groupDeadlineContract";
import { recordLaunchClocks } from "../recordLaunchClocks";
import { reserveGroupDeadline } from "./reserveGroupDeadline";

let fixture: Awaited<ReturnType<typeof stopFixture>>;
afterEach(async () => fixture.db.$client.close());

async function setup(minutes = 2, launched = false) {
	fixture = await stopFixture(launched);
	const groupDefinition = {
		version: 1, groupNodeId: "group", parentGroupNodeId: null, scopeVertexId: "scope",
		outputVertexId: "output", parallel: false, minutes, childNodeIds: ["child"],
		childVertexIds: { child: "child" }, entryNodeIds: ["child"], terminalNodeIds: ["child"],
		settlementVertexIds: { child: "settle" }, edges: [],
	};
	const snapshot = {
		...fixture.input.snapshot, engine: "langflow" as const, componentManifestHash: fixture.input.publication.componentManifestHash, graphDocument: { nodes: [{ id: "scope", data: {
			type: "TrellisGroupScopeV1", node: { template: { scope_definition: { value: JSON.stringify(groupDefinition) } } },
		} }] },
	};
	await fixture.run(async (tx) => {
		await tx.update(langflowExecutions).set({ snapshot }).where(eq(langflowExecutions.executionId, ids.execution));
		await tx.update(langflowExecutionProjections).set({ view: { ...fixture.view, snapshot } })
			.where(eq(langflowExecutionProjections.executionId, ids.execution));
	});
	const request: GroupDeadlineScope = {
		executionId: ids.execution, publicationId: ids.publication, engineJobId: fixture.request.engineJobId,
		engineEpoch: 1, scopeVertexId: "scope", occurrenceKey: "group.501", groupDefinition,
		occurrence: { nodeId: "group", occurrenceKey: "group.501", parentOccurrenceKey: "outer.501", phase: "children",
			iterationPath: [{ loopNodeId: "loop", round: 501 }] },
		scope: { parentOccurrenceKey: "outer.501", phase: "children", iterationPath: [{ loopNodeId: "loop", round: 501 }],
			inputReceiptIds: [], groupDeadlineRefs: [fixture.deadline.deadlineId], deadlineAt: null },
	};
	return request;
}
function reserve(request: GroupDeadlineScope, at = now) {
	return fixture.run((tx) => reserveGroupDeadline({ ...fixture.core, actor: { kind: "system", name: "trellis" }, now: at }, tx,
		{ request, capabilityId: fixture.authority.capabilityId }));
}

test("reservation and replay retain null clocks before a delayed native launch", async () => {
	const request = await setup(100_001);
	const first = await reserve(request);
	expect(first.deadline.budgetMs).toBe(100_001 * 60_000);
	expect(first.deadline.launchedAt).toBeNull();
	expect(first.deadline.deadlineAt).toBeNull();
	expect(first.deadline.launchReceiptId).toBeNull();
	expect(await reserve(request, new Date(now.getTime() + 120_000))).toEqual(first);
	const childHandle = { ...handle, stepId: "child-step", attemptId: crypto.randomUUID() };
	await fixture.run(async (tx) => {
		await reserveNative(tx, { requestBytes: JSON.stringify({ ...fixture.request, requestId: crypto.randomUUID(),
			nodeId: "child", occurrenceKey: "child.501", groupDeadlineRefs: first.groupDeadlineRefs }),
			taskKey: "child/501/step", handle: childHandle, authority: fixture.authority, now });
		await recordLaunch(tx, { executionId: ids.execution, receipt: { version: 1, launchReceiptId: "delayed-launch",
			stepId: childHandle.stepId, attemptId: childHandle.attemptId, launchedAt: new Date(now.getTime() + 180_000).toISOString(),
			recordedAt: new Date(now.getTime() + 240_000).toISOString(), groupDeadlines: [] } });
		await recordLaunchClocks(fixture.core, tx, { executionId: ids.execution, stepId: childHandle.stepId });
	});
	const started = await reserve(request);
	expect(started.deadline.deadlineId).toBe(first.deadline.deadlineId);
	expect(started.deadline.launchedAt).toBe(new Date(now.getTime() + 180_000).toISOString());
	expect(started.deadline.deadlineAt).toBe(new Date(now.getTime() + 180_000 + 100_001 * 60_000).toISOString());
	expect(started.deadlineAt).toBe(new Date(now.getTime() + 300_000).toISOString());
	expect(await reserve(request)).toEqual(started);
});

test("nested groups preserve an earlier inherited bound and distinct loop occurrences", async () => {
	const request = await setup(3, true);
	request.scope.deadlineAt = new Date(now.getTime() + 30_000).toISOString();
	const first = await reserve(request);
	expect(first.groupDeadlineRefs).toEqual(["deadline-1", first.deadline.deadlineId]);
	expect(first.deadlineAt).toBe(request.scope.deadlineAt);
	const next = structuredClone(request);
	next.occurrenceKey = next.occurrence.occurrenceKey = "group.502";
	next.occurrence.iterationPath[0]!.round = 502;
	const second = await reserve(next);
	expect(second.deadline.deadlineId).not.toBe(first.deadline.deadlineId);
	expect(second.deadline.launchedAt).toBeNull();
});

test("changed frozen budgets and changed occurrence semantics conflict with the saved reservation", async () => {
	const request = await setup();
	await reserve(request);
	const changed = structuredClone(request);
	changed.occurrence.parentOccurrenceKey = "other-parent";
	await expect(reserve(changed)).rejects.toThrow("deadline_conflict");
	changed.groupDefinition.minutes = 3;
	await expect(reserve(changed)).rejects.toThrow("group_definition_conflict");
	const [row] = await fixture.run((tx) => tx.select().from(langflowExecutions).where(eq(langflowExecutions.executionId, ids.execution)));
	const snapshot = structuredClone(row!.snapshot);
	if (snapshot.engine !== "langflow") throw new Error("fixture_engine");
	snapshot.graphDocument = { nodes: [{ id: "scope", data: { type: "TrellisGroupScopeV1", node: { template: {
		scope_definition: { value: JSON.stringify({ ...request.groupDefinition, minutes: 3 }) },
	} } } }] };
	await fixture.run((tx) => tx.update(langflowExecutions).set({ snapshot }).where(eq(langflowExecutions.executionId, ids.execution)));
	await expect(reserve({ ...request, groupDefinition: { ...request.groupDefinition, minutes: 3 } })).rejects.toThrow("deadline_conflict");
});

test("cancellation blocks replay and reservation rolls back with its caller", async () => {
	const request = await setup();
	await expect(fixture.run(async (tx) => {
		await reserveGroupDeadline({ ...fixture.core, actor: { kind: "system", name: "trellis" } }, tx,
			{ request, capabilityId: fixture.authority.capabilityId });
		throw new Error("abort");
	})).rejects.toThrow("abort");
	const first = await reserve(request);
	expect(first.deadline.launchedAt).toBeNull();
	await fixture.run((tx) => cancelView(fixture.core, tx, { id: ids.execution, expectedRevision: 1 }));
	await expect(reserve(request)).rejects.toThrow("admission_closed");
});
