import { eq } from "drizzle-orm";
import { ids, now, receiptFixture } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { nativeRequest } from "../../../db/queries/langflowExecution/fixtures/native";
import { langflowExecutions } from "../../../db/tables/langflowExecution";
import { protocolDigest } from "../../../langflowContracts";
import { documentBytes } from "../../flowDocuments";
import { promptFixture } from "../assembleNativePrompt/fixture";
import type { NativeVisit } from "../nativeVisit";

export async function occurrenceFixture(omitModel = false) {
	const { db, input, authority } = await receiptFixture();
	const source = promptFixture();
	const harness = { ...source.approved.harness };
	if (omitModel) delete harness.model;
	const spec = {
		nodeId: nativeRequest.nodeId,
		taskKeyBase: "review",
		name: source.approved.name,
		instruction: source.approved.instruction,
		harness,
		...(source.approved.accountId === undefined ? {} : { accountId: source.approved.accountId }),
	};
	const snapshot = input.snapshot;
	if (snapshot.engine !== "langflow") throw new Error("fixture_engine");
	snapshot.graphDocument.trellisRequestSpecsV1 = { vertex: spec };
	const publication = { ...input.publication, conversion: null };
	const submissionBytes = JSON.stringify({ publication, snapshot });
	await db
		.update(langflowExecutions)
		.set({
			publication,
			snapshot,
			submissionBytes,
			submission: { ...input.submission, submissionDigest: protocolDigest(submissionBytes) },
		})
		.where(eq(langflowExecutions.executionId, ids.execution));
	const request = {
		...structuredClone(nativeRequest),
		specHash: protocolDigest(documentBytes(spec).toString("utf8")),
		inputReceiptIds: ["receipt-1"],
	};
	const receiptBytes = JSON.stringify({
		version: 1,
		receiptId: "receipt-1",
		executionId: request.executionId,
		publicationId: request.publicationId,
		engineJobId: request.engineJobId,
		nodeId: "prior",
		occurrenceKey: "prior.501",
		output: JSON.stringify({ approved: false, output: "Full NO feedback" }),
	});
	const visit: NativeVisit = {
		engineNodeId: "vertex",
		requestBytes: JSON.stringify(request),
		engineWaitId: "00000000-0000-4000-8000-000000000099",
		waitBytes: JSON.stringify({ kind: "native_reservation", waitId: "00000000-0000-4000-8000-000000000099", request }),
		occurrence: {
			nodeId: request.nodeId,
			occurrenceKey: request.occurrenceKey,
			parentOccurrenceKey: request.parentOccurrenceKey,
			phase: request.phase,
			iterationPath: request.iterationPath,
		},
		scope: { inputReceiptIds: request.inputReceiptIds, groupDeadlineRefs: [], deadlineAt: null },
		admissionReceipt: request.admissionReceipt,
		inputReceipts: [{ receiptId: "receipt-1", receiptBytes, receiptDigest: protocolDigest(receiptBytes) }],
	};
	return { db, request, visit, ctx: { now, nativeAuthority: authority } };
}
