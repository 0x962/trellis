import { nativeRequest } from "../../../db/queries/langflowExecution/fixtures/native";
import { protocolDigest } from "../../../langflowContracts";
import { documentBytes } from "../../flowDocuments";
import { retainedPublication } from "../../flowDocuments/readExecutionPublication/fixture";
import type { ApprovedNativeOccurrence } from "../types";

export function promptFixture(outputs = ["first", "second"]) {
	const execution = {
		...retainedPublication(),
		ticketId: "retained-ticket",
		projectId: "retained-project",
		diffId: "retained-diff",
		reviewedHead: "a".repeat(40),
	};
	if (execution.snapshot.engine !== "langflow") throw new Error("fixture_engine");
	const spec = {
		nodeId: nativeRequest.nodeId,
		taskKeyBase: "review",
		name: "Review",
		instruction: "  Original instruction.\nPreserve spacing.  ",
		harness: {
			preset: "codex" as const,
			model: "openai/gpt-6-astra" as const,
			effort: "high" as const,
			startCommand: "codex {{prompt}}",
			resumeCommand: "codex resume {{resumeText}}",
		},
		accountId: "retained-account",
	};
	execution.snapshot.graphDocument.trellisRequestSpecsV1 = { vertex: spec };
	execution.submissionBytes = JSON.stringify({ publication: execution.publication, snapshot: execution.snapshot });
	execution.submission.submissionDigest = protocolDigest(execution.submissionBytes);
	const request = {
		...structuredClone(nativeRequest),
		executionId: execution.executionId,
		publicationId: execution.publicationId,
		specHash: protocolDigest(documentBytes(spec).toString("utf8")),
		inputReceiptIds: outputs.map((_, index) => `receipt-${index}`),
	};
	const approved: ApprovedNativeOccurrence = {
		...spec,
		engineNodeId: "vertex",
		taskKey: JSON.stringify([
			spec.taskKeyBase,
			request.nodeId,
			request.parentOccurrenceKey,
			request.phase,
			request.iterationPath.map(({ loopNodeId, round }) => [loopNodeId, round]),
		]),
		requestDigest: protocolDigest(JSON.stringify(request)),
		specHash: request.specHash,
		inputReceipts: outputs.map((output, index) => {
			const receiptId = request.inputReceiptIds[index]!;
			const receiptBytes = JSON.stringify({
				version: 1,
				receiptId,
				executionId: request.executionId,
				publicationId: request.publicationId,
				engineJobId: request.engineJobId,
				nodeId: `source-${index}`,
				occurrenceKey: `visit-${index}`,
				output,
			});
			return { receiptId, receiptBytes, receiptDigest: protocolDigest(receiptBytes) };
		}),
	};
	return { execution, request, approved };
}
