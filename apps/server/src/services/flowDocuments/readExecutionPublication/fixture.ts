import type { FlowDocumentSnapshotV1, FlowPublicationV1 } from "@trellis/api";
import { protocolDigest } from "../../../langflowContracts";
import { documentBytes } from "../documentBytes";
import type { RetainedExecutionPublication } from "./readExecutionPublication";

export function retainedPublication(): RetainedExecutionPublication {
	const flowId = "00000000000000000000000001";
	const executionId = "00000000000000000000000002";
	const content = {
		engine: "langflow" as const,
		schemaVersion: 1 as const,
		componentManifestHash: "a".repeat(64),
		graphDocument: {
			nodes: [],
			edges: [],
			trellisRequestSpecsV1: { vertex: { instruction: "  Keep\nexact bytes.  " } },
		},
	};
	const snapshot: FlowDocumentSnapshotV1 = {
		...content,
		flow: {
			id: flowId,
			project: null,
			slug: "original-name",
			version: 2,
			name: "Original name",
			description: "Retained description",
			briefing: "Retained briefing",
			harness: null,
			createdAt: "2026-09-29T06:00:00.000Z",
			updatedAt: "2026-09-29T08:00:00.000Z",
		},
		revision: 2,
		documentHash: protocolDigest(documentBytes(content).toString("utf8")),
		diagnostics: [],
	};
	const publication: FlowPublicationV1 = {
		publicationId: "00000000000000000000000003",
		flowId,
		revision: 2,
		documentHash: snapshot.documentHash,
		engineFlowId: "immutable-engine-flow",
		enginePackageDigest: "b".repeat(64),
		componentManifestHash: content.componentManifestHash,
		publishedAt: "2026-09-29T08:01:00.000Z",
		conversion: null,
	};
	const submissionBytes = JSON.stringify({ publication, snapshot });
	return {
		executionId,
		flowId,
		publicationId: publication.publicationId,
		publication,
		snapshot,
		submissionBytes,
		submission: {
			version: 1,
			hostId: "host",
			executionId,
			publicationId: publication.publicationId,
			actor: { kind: "human", name: "test" },
			requestId: crypto.randomUUID(),
			requestDigest: "c".repeat(64),
			submissionDigest: protocolDigest(submissionBytes),
			state: "reserved",
			correlation: null,
			admission: { state: "closed", barrierId: executionId },
			revision: 1,
		},
	};
}
