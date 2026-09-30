import { executionViewV1Example, publicationV1Example } from "@trellis/api";
import { content, saveInput } from "../../../../../apps/server/src/db/queries/langflowDocuments/inputs.fixture";
import { insertDocumentPublication } from "../../../../../apps/server/src/db/queries/langflowDocuments/insertPublication";
import { saveDocument } from "../../../../../apps/server/src/db/queries/langflowDocuments/save";
import {
	openAdmission,
	reserveExecution,
} from "../../../../../apps/server/src/db/queries/langflowExecution/executions";
import {
	authority,
	ids,
	jobId,
	now,
} from "../../../../../apps/server/src/db/queries/langflowExecution/fixtures/fixture";
import { nativeRequest } from "../../../../../apps/server/src/db/queries/langflowExecution/fixtures/native";
import { initializeProjection } from "../../../../../apps/server/src/db/queries/langflowExecution/projections";
import type { Tx } from "../../../../../apps/server/src/db/tx";
import { protocolDigest, type SubmissionV1 } from "../../../../../apps/server/src/langflowContracts";
import { documentBytes } from "../../../../../apps/server/src/services/flowDocuments";
import type { NativeVisit } from "../../../../../apps/server/src/services/langflowNative/nativeVisit";

export async function nativeAdapterPublication(tx: Tx) {
	const spec = {
		nodeId: nativeRequest.nodeId,
		taskKeyBase: "root/501/review",
		name: "Native fixture",
		instruction: "Return the exact fixture result.",
		harness: {
			preset: "codex" as const,
			model: "openai/gpt-6-astra" as const,
			effort: "high" as const,
			startCommand: "codex {{prompt}}",
			resumeCommand: "codex resume {{resumeText}}",
		},
		accountId: "native-adapter-account",
	};
	const document = {
		...content,
		engine: "langflow" as const,
		graphDocument: { data: { nodes: [], edges: [] }, trellisRequestSpecsV1: { vertex: spec } },
	};
	const saved = await saveDocument(tx, saveInput({ content: document, sourceBytes: documentBytes(document) }));
	if (saved.state !== "saved") throw new Error("fixture_save_failed");
	const { publication: _progress, lastExecutablePublication: _last, ...snapshot } = saved.receipt;
	const publication = {
		...publicationV1Example,
		revision: snapshot.revision,
		documentHash: snapshot.documentHash,
		componentManifestHash: document.componentManifestHash,
		conversion: null,
	};
	await insertDocumentPublication(tx, publication);
	const submissionBytes = JSON.stringify({ publication, snapshot });
	const startBytes = JSON.stringify({ flowId: ids.flow, ticketId: ids.ticket, publicationId: ids.publication });
	const submission: SubmissionV1 = {
		version: 1,
		hostId: authority.hostId,
		executionId: ids.execution,
		publicationId: ids.publication,
		requestId: "00000000-0000-4000-8000-000000000003",
		actor: { kind: "human", name: "fixture" },
		requestDigest: protocolDigest(startBytes),
		submissionDigest: protocolDigest(submissionBytes),
		state: "reserved",
		correlation: null,
		admission: { state: "closed", barrierId: "barrier-1" },
		revision: 1,
	};
	await reserveExecution(tx, {
		executionId: ids.execution,
		flowId: ids.flow,
		ticketId: ids.ticket,
		projectId: ids.project,
		diffId: ids.diff,
		reviewedHead: "a".repeat(40),
		publicationId: ids.publication,
		publicationRecordId: ids.publication,
		publication,
		snapshot,
		hostId: authority.hostId,
		actorKind: "human",
		actorName: "fixture",
		requestId: submission.requestId,
		requestBytes: startBytes,
		submissionBytes,
		submission,
		admission: submission.admission,
		revision: 1,
		createdAt: now,
	});
	const admission = {
		...nativeRequest.admissionReceipt,
		submissionDigest: submission.submissionDigest,
	};
	const currentAuthority = { ...authority, publicationDigest: publication.documentHash };
	await openAdmission(tx, {
		executionId: ids.execution,
		correlation: {
			version: 1,
			hostId: authority.hostId,
			executionId: ids.execution,
			publicationId: ids.publication,
			submissionDigest: submission.submissionDigest,
			engineJobId: jobId,
			engineSessionId: "engine-session-1",
			recordedAt: now.toISOString(),
		},
		receipt: admission,
		authority: currentAuthority,
	});
	await initializeProjection(tx, {
		view: { ...executionViewV1Example, snapshot, publication, revision: 1, lastEventSeq: 0 },
	});
	const request = {
		...structuredClone(nativeRequest),
		specHash: protocolDigest(documentBytes(spec).toString("utf8")),
		admissionReceipt: admission,
	};
	const requestBytes = JSON.stringify(request);
	const engineWaitId = "00000000-0000-4000-8000-000000000099";
	const visit: NativeVisit = {
		engineNodeId: "vertex",
		engineWaitId,
		waitBytes: JSON.stringify({ kind: "native_reservation", waitId: engineWaitId, request }),
		requestBytes,
		occurrence: {
			nodeId: request.nodeId,
			occurrenceKey: request.occurrenceKey,
			parentOccurrenceKey: request.parentOccurrenceKey,
			phase: request.phase,
			iterationPath: request.iterationPath,
		},
		scope: {
			inputReceiptIds: request.inputReceiptIds,
			groupDeadlineRefs: request.groupDeadlineRefs,
			deadlineAt: request.deadlineAt,
		},
		admissionReceipt: admission,
		inputReceipts: [],
	};
	return { authority: currentAuthority, requestBytes, visit };
}
