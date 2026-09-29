import { expect, test } from "bun:test";
import { projectOccurrence } from "../../../occurrence";
import { fixture as nativeFixture } from "../../../testFixture";
import { containerOccurrences } from "./containerOccurrences";

function fixture() {
	const metadata = (nodeId: string) => ({
		nodeId,
		title: `Title ${nodeId}`,
		instructions: `Full ${nodeId} instructions`,
		actionIdentity: nodeId,
	});
	const lifecycle = {
		state: "running",
		acceptedResultId: null as string | null,
		startedAt: null as string | null,
		endedAt: null as string | null,
		error: null,
		skipReason: null,
	};
	const occurrence = (nodeId: string, occurrenceKey: string, parentOccurrenceKey: string | null) => ({
		nodeId,
		occurrenceKey,
		parentOccurrenceKey,
		phase: "children",
		iterationPath: [],
	});
	const row = (nodeId: string, key: string, parent: string | null) => ({
		occurrence: occurrence(nodeId, key, parent),
		metadata: metadata(nodeId),
		projection: { ...lifecycle },
		resultReceiptIds: [] as string[],
	});
	const outer = {
		...row("outer", "outer-visit", null),
		scope: { groupDeadlineRefs: ["outer-deadline"] },
	};
	const inner = {
		...row("inner", "inner-visit", "outer-visit"),
		scope: { groupDeadlineRefs: ["outer-deadline", "inner-deadline"] },
	};
	const loopRow = (round: number) => ({
		...row("loop", `round-${round}`, "inner-visit"),
		occurrence: {
			...occurrence("loop", `round-${round}`, "inner-visit"),
			phase: "condition",
			iterationPath: [{ loopNodeId: "loop", round }],
		},
	});
	const prior = loopRow(1);
	prior.projection = {
		...lifecycle,
		state: "succeeded",
		acceptedResultId: "condition-completion",
		endedAt: "2026-09-29T22:00:00Z",
	};
	prior.resultReceiptIds = ["child-result", "condition-output"];
	const current = loopRow(501);
	current.resultReceiptIds = ["new-child-result"];
	const checkpoint = {
		group_visit_scopes: { "outer-visit": outer, "inner-visit": inner },
		group_scope_definitions: {
			"outer-visit": { groupNodeId: "outer", scopeVertexId: "outer:scope" },
			"inner-visit": { groupNodeId: "inner", scopeVertexId: "inner:scope" },
		},
		trellis_loop_visits: {
			loop: { loopNodeId: "loop", groupDeadlineRefs: ["inner-deadline"], history: [prior, current] },
		},
	};
	const publication = {
		nodes: [
			{ id: "outer:scope", data: { type: "TrellisGroupScopeV1", node: { trellis_metadata: outer.metadata } } },
			{ id: "inner:scope", data: { type: "TrellisGroupScopeV1", node: { trellis_metadata: inner.metadata } } },
			{ id: "loop", data: { type: "TrellisLoopV1", node: { trellis_metadata: prior.metadata } } },
		],
	};
	return { checkpoint, publication };
}

test("nested groups and every loop round retain recorded identity and facts", () => {
	const { checkpoint, publication } = fixture();
	const bytes = JSON.stringify(checkpoint);
	const rows = containerOccurrences(publication, checkpoint);
	expect(rows.map((item) => item.occurrenceKey)).toEqual(["outer-visit", "inner-visit", "round-1", "round-501"]);
	expect(rows[1]).toMatchObject({
		parentOccurrenceKey: "outer-visit",
		deadlineRefs: ["outer-deadline", "inner-deadline"],
	});
	expect(rows[2]).toMatchObject({
		state: "succeeded",
		startedAt: null,
		acceptedResultId: "condition-completion",
		title: "Title loop",
	});
	expect(rows[3]).toMatchObject({
		state: "running",
		startedAt: null,
		endedAt: null,
		acceptedResultId: null,
		iterationPath: [{ loopNodeId: "loop", round: 501 }],
	});
	expect(JSON.stringify(checkpoint)).toBe(bytes);
	const projected = projectOccurrence(rows[2]!, undefined, nativeFixture().facts, undefined);
	expect(projected).toMatchObject({
		state: "succeeded",
		attempts: [],
		output: null,
		outputSource: null,
		decision: null,
	});
});

test("container metadata must match the immutable publication", () => {
	const { checkpoint, publication } = fixture();
	checkpoint.trellis_loop_visits.loop.history[1]!.metadata.instructions = "changed";
	expect(() => containerOccurrences(publication, checkpoint)).toThrow("projection_container_metadata_conflict");
});

test("a group key cannot substitute another occurrence", () => {
	const { checkpoint, publication } = fixture();
	checkpoint.group_visit_scopes["inner-visit"].occurrence.occurrenceKey = "other";
	expect(() => containerOccurrences(publication, checkpoint)).toThrow("projection_group_identity_conflict");
});
