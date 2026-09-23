import { expect, test } from "bun:test";
import type { FlowSummary } from "@trellis/api";
import { startFlowId } from "./startFlowId";

const flow = (id: string): FlowSummary => ({
	id,
	project: null,
	slug: id,
	name: id,
	description: "",
	harness: null,
	version: 1,
	createdAt: "2026-09-22T00:00:00.000Z",
	updatedAt: "2026-09-22T00:00:00.000Z",
	nodeCount: 0,
	edgeCount: 0,
});

test("selects the first listed flow before a person chooses one", () => {
	expect(startFlowId([flow("review"), flow("ship")], "")).toBe("review");
});

test("keeps the person selected flow", () => {
	expect(startFlowId([flow("review"), flow("ship")], "ship")).toBe("ship");
});

test("keeps the empty selection when no flow exists", () => {
	expect(startFlowId([], "")).toBe("");
});
