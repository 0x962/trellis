import type { FlowDocumentSaveV1Input } from "@trellis/api";
import {
	flowV1Digest,
	flowV1FixtureIds,
	flowV1RequestId,
	publishedDocumentV1Example,
} from "../../../../packages/api/src/schemas/flowV1Fixtures.ts";
import type { EditorGraphDocument } from "./editorDocument.ts";
import type { EditorGrant } from "./editorGrant.ts";

export const probeTime = "2026-09-29T07:00:00Z";

export const editorGrantFixture: EditorGrant = {
	actor: "human:navidkhan",
	hostId: "Canary-JQV57W1HPL",
	flowId: flowV1FixtureIds.flow,
	projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
	revision: publishedDocumentV1Example.revision,
	allowedOperations: ["document:read", "document:save", "component-manifest:read"],
	expiresAt: "2026-09-29T07:30:00Z",
};

export const editorGraphFixture: EditorGraphDocument = {
	data: {
		nodes: [
			{
				id: "agent-1",
				type: "agent",
				position: { x: 0, y: 0 },
				data: { label: "Review source", config: { instruction: "Review the source." } },
			},
			{
				id: "native-gate-1",
				type: "native-gate",
				position: { x: 240, y: 0 },
				data: { label: "Readability", config: { question: "Is the change readable?" } },
			},
			{
				id: "jev-gate-1",
				type: "jev-gate",
				position: { x: 480, y: 0 },
				data: { label: "Relevance", config: { areas: ["frontend", "backend"] } },
			},
			{
				id: "human-1",
				type: "human",
				position: { x: 720, y: 0 },
				data: { label: "Approval", config: { question: "Approve this result?" } },
			},
			{
				id: "ordered-group-1",
				type: "ordered-group",
				position: { x: 0, y: 240 },
				data: { label: "Ordered checks", config: { children: ["agent-1", "native-gate-1"] } },
			},
			{
				id: "parallel-group-1",
				type: "parallel-group",
				position: { x: 240, y: 240 },
				data: { label: "Parallel checks", config: { children: ["jev-gate-1", "human-1"] } },
			},
			{
				id: "loop-1",
				type: "loop",
				position: { x: 480, y: 240 },
				data: { label: "Correction loop", config: { exitQuestion: "Is the result ready?", maximumRounds: 3 } },
			},
		],
		edges: [],
	},
};

export const saveRequestFixture: FlowDocumentSaveV1Input = {
	flow: flowV1FixtureIds.flow,
	expectedVersion: publishedDocumentV1Example.revision,
	requestId: flowV1RequestId,
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: editorGraphFixture,
	componentManifestHash: flowV1Digest,
};
