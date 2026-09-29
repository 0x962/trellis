import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { type NativeRequestV1, protocolDigest } from "../../../langflowContracts";
import { documentBytes, readExecutionPublication, type RetainedExecutionPublication } from "../../flowDocuments";
import { readConversionBinding } from "../../langflowMigration";
import { readPromptInputs } from "../readPromptInputs";
import type { ApprovedNativeOccurrence, NativeExecution } from "../types";

type Execution = RetainedExecutionPublication &
	Pick<NativeExecution, "ticketId" | "projectId" | "diffId" | "reviewedHead">;

export function assembleNativePrompt(
	execution: Execution,
	request: NativeRequestV1,
	approved: ApprovedNativeOccurrence,
) {
	const verified = readExecutionPublication(execution);
	const specs = z.record(z.string(), z.json()).parse(verified.graphDocument.trellisRequestSpecsV1);
	const spec = z.record(z.string(), z.json()).parse(specs[approved.engineNodeId]);
	const expectedSpec = {
		nodeId: request.nodeId,
		taskKeyBase: spec.taskKeyBase,
		name: approved.name,
		instruction: approved.instruction,
		harness: approved.harness,
		...(approved.accountId === undefined ? {} : { accountId: approved.accountId }),
	};
	if (
		request.executionId !== execution.executionId ||
		request.publicationId !== execution.publicationId ||
		protocolDigest(documentBytes(spec).toString("utf8")) !== request.specHash ||
		!isDeepStrictEqual(spec, expectedSpec) ||
		typeof spec.taskKeyBase !== "string" ||
		approved.taskKey !==
			JSON.stringify([
				spec.taskKeyBase,
				request.nodeId,
				request.parentOccurrenceKey,
				request.phase,
				request.iterationPath.map(({ loopNodeId, round }) => [loopNodeId, round]),
			])
	)
		throw new Error("native_prompt_spec_conflict");
	const converted = verified.graphDocument.trellisConversionV1 !== undefined || verified.publication.conversion !== null;
	const briefing = converted
		? readConversionBinding(verified, {
				engineNodeId: approved.engineNodeId,
				phase: request.phase,
				specNamespace: "trellisRequestSpecsV1",
			}).sourceFlow.briefing
		: verified.snapshot.flow.briefing;
	const inputs = readPromptInputs(request, approved.inputReceipts);
	const target = {
		executionId: execution.executionId,
		projectId: execution.projectId,
		ticketId: execution.ticketId,
		diffId: execution.diffId,
		reviewedHead: execution.reviewedHead,
	};
	const instruction = [
		briefing,
		`Flow target:\n${JSON.stringify(target)}`,
		`Flow step: ${request.nodeId}`,
		approved.instruction,
		`Prior step outputs:\n${JSON.stringify(inputs)}`,
		request.phase === "condition" ? "Answer the condition with exactly YES or NO as the complete final response." : "",
	]
		.filter(Boolean)
		.join("\n\n");
	return {
		instruction,
		provenance: {
			version: 1,
			engineNodeId: approved.engineNodeId,
			publicationId: execution.publicationId,
			submissionDigest: execution.submission.submissionDigest,
			requestDigest: approved.requestDigest,
			specHash: request.specHash,
			inputReceipts: approved.inputReceipts,
			instructionDigest: protocolDigest(instruction),
		},
	};
}
