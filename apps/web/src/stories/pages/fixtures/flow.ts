import type { FlowDoc } from "@trellis/api";
import { id, timestamp } from "./project";
import { projectResponses } from "./responses";

export const flowDoc: FlowDoc = {
	flow: {
		id: id(500),
		project: "DEMO",
		slug: "interface-review",
		name: "Interface review",
		description: "Review the interface and ask for a human decision.",
		briefing: "Read the linked ticket before the review.",
		harness: { preset: "claude" },
		version: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	nodes: [
		{
			id: id(501),
			parentId: null,
			kind: "agent",
			title: "Review the interface",
			instruction: "Read the diff. Check the layout and keyboard controls.",
			parallel: false,
			minutes: null,
			maxRounds: null,
			x: 0,
			y: 0,
			width: null,
			height: null,
			harness: null,
		},
		{
			id: id(502),
			parentId: null,
			kind: "gate",
			title: "Does the review pass?",
			instruction: "Answer YES when every required check passes.",
			parallel: false,
			minutes: null,
			maxRounds: null,
			x: 0,
			y: 180,
			width: null,
			height: null,
			harness: null,
		},
		{
			id: id(503),
			parentId: null,
			kind: "human",
			title: "Approve the result",
			instruction: "Review the evidence and approve the change.",
			parallel: false,
			minutes: null,
			maxRounds: null,
			x: 0,
			y: 360,
			width: null,
			height: null,
			harness: null,
		},
	],
	edges: [
		{ id: id(510), fromNodeId: id(501), toNodeId: id(502), branch: "out" },
		{ id: id(511), fromNodeId: id(502), toNodeId: id(503), branch: "yes" },
	],
};

export const flowSummaries = [{ ...flowDoc.flow, nodeCount: 3, edgeCount: 2 }];
export const flowResponses = {
	...projectResponses,
	"flows.list": flowSummaries,
	"flows.get": flowDoc,
	"flowExecutions.list": [],
};
