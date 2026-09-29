import type { FlowDoc } from "@trellis/api";
import { fixtureDocument, fixtureId, fixtureNode } from "../fixture";

export const compilerScenarios = (): Record<string, FlowDoc> => {
	const roots = fixtureDocument();
	const branching = fixtureDocument();
	branching.nodes = [fixtureNode(1, { kind: "gate" }), fixtureNode(2), fixtureNode(3)];
	branching.edges = [
		{ id: fixtureId(11), fromNodeId: fixtureId(1), toNodeId: fixtureId(2), branch: "yes" },
		{ id: fixtureId(12), fromNodeId: fixtureId(1), toNodeId: fixtureId(3), branch: "no" },
	];
	const nested = fixtureDocument();
	nested.nodes = [
		fixtureNode(1, { kind: "group", minutes: 61 }),
		fixtureNode(2, { parentId: fixtureId(1), kind: "group", parallel: true }),
		fixtureNode(3, { parentId: fixtureId(2) }),
		fixtureNode(4, { parentId: fixtureId(2), kind: "human" }),
	];
	const loop = fixtureDocument();
	loop.nodes = [
		fixtureNode(1, { kind: "loop", maxRounds: 51 }),
		fixtureNode(2, { parentId: fixtureId(1) }),
		fixtureNode(3, { parentId: fixtureId(1), kind: "human" }),
	];
	loop.edges = [{ id: fixtureId(11), fromNodeId: fixtureId(2), toNodeId: fixtureId(3), branch: "out" }];
	const review = fixtureDocument();
	review.nodes = [fixtureNode(1, { kind: "gate", reviewArea: "frontend" }), fixtureNode(2), fixtureNode(3)];
	review.edges = structuredClone(branching.edges);
	const empty = fixtureDocument();
	empty.nodes = [fixtureNode(1, { kind: "group" })];
	const dense = fixtureDocument();
	dense.nodes = Array.from({ length: 501 }, (_, index) => fixtureNode(index + 1));
	return { roots, branching, nested, loop, review, empty, dense };
};
