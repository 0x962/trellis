import type { FlowDoc, FlowNode } from "@trellis/api";

export const fixtureId = (value: number) => `01M3NX${String(value).padStart(20, "0")}`;

export const fixtureNode = (value: number, fields: Partial<FlowNode> = {}): FlowNode => ({
	id: fixtureId(value),
	parentId: null,
	kind: "agent",
	title: `Step ${value}`,
	instruction: "  Exact\r\ninstruction\t\u{1F642} e\u0301\n",
	parallel: false,
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
	harness: null,
	...fields,
});

export const fixtureDocument = (): FlowDoc => ({
	flow: {
		id: fixtureId(0),
		project: null,
		slug: "fixture",
		name: "Fixture",
		description: "Copy conversion fixture",
		briefing: "  Exact briefing\r\n",
		harness: null,
		version: 71,
		createdAt: "2026-09-29T00:00:00.000Z",
		updatedAt: "2026-09-29T00:00:00.000Z",
	},
	nodes: [fixtureNode(1), fixtureNode(2)],
	edges: [],
});
