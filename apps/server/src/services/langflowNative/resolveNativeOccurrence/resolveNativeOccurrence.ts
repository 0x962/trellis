import { isDeepStrictEqual } from "node:util";
import { HarnessSchema } from "@trellis/api";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ServiceCtx } from "../../../context";
import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution/executions";
import { langflowDeadlines } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import {
	type DeliveryAuthorityV1,
	NativeRequestV1Schema,
	protocolDigest,
	readProtocolBytes,
} from "../../../langflowContracts";
import { readExecutionPublication } from "../../flowDocuments";
import { ResolvedConversionHarnessSchema } from "../../langflowMigration";
import { assembleNativePrompt } from "../assembleNativePrompt";
import type { NativeVisit } from "../nativeVisit";
import type { ApprovedNativeOccurrence } from "../types";

const SpecSchema = z.strictObject({
	nodeId: z.string(),
	taskKeyBase: z.string().min(1),
	name: z.string(),
	instruction: z.string(),
	harness: z.record(z.string(), z.json()),
	accountId: z.string().optional(),
});

export async function resolveNativeOccurrence(
	ctx: Pick<ServiceCtx, "now"> & { nativeAuthority: DeliveryAuthorityV1 },
	tx: Tx,
	input: { requestBytes: string; visit: NativeVisit },
): Promise<ApprovedNativeOccurrence> {
	const request = readProtocolBytes(NativeRequestV1Schema, input.requestBytes);
	const execution = await lockExecution(tx, request);
	await assertAuthority(tx, execution, ctx.nativeAuthority, "native.reserve", ctx.now);
	if (
		execution.cancelIntent !== null ||
		execution.admission.state !== "open" ||
		!isDeepStrictEqual(execution.admission.receipt, request.admissionReceipt)
	)
		throw new Error("admission_closed");
	const { visit } = input;
	const occurrence = {
		nodeId: request.nodeId,
		occurrenceKey: request.occurrenceKey,
		parentOccurrenceKey: request.parentOccurrenceKey,
		phase: request.phase,
		iterationPath: request.iterationPath,
	};
	const scope = {
		inputReceiptIds: request.inputReceiptIds,
		groupDeadlineRefs: request.groupDeadlineRefs,
		deadlineAt: request.deadlineAt,
	};
	if (
		visit.requestBytes !== input.requestBytes ||
		!isDeepStrictEqual(visit.occurrence, occurrence) ||
		!isDeepStrictEqual(visit.scope, scope) ||
		!isDeepStrictEqual(visit.admissionReceipt, request.admissionReceipt)
	)
		throw new Error("native_visit_conflict");
	if (request.deadlineAt !== null && Date.parse(request.deadlineAt) <= ctx.now.getTime())
		throw new Error("native_deadline_elapsed");
	const deadlines = await tx
		.select()
		.from(langflowDeadlines)
		.where(eq(langflowDeadlines.executionId, request.executionId));
	for (const ref of request.groupDeadlineRefs) {
		const saved = deadlines.find((row) => row.deadline.deadlineId === ref);
		if (!saved) throw new Error("native_deadline_missing");
		if (saved.deadline.deadlineAt !== null && Date.parse(saved.deadline.deadlineAt) <= ctx.now.getTime())
			throw new Error("native_deadline_elapsed");
	}
	const publication = readExecutionPublication(execution);
	const specs = z.record(z.string(), z.json()).parse(publication.graphDocument.trellisRequestSpecsV1);
	const spec = SpecSchema.parse(specs[visit.engineNodeId]);
	if (!ResolvedConversionHarnessSchema.safeParse(spec.harness).success) throw new Error("native_policy_unresolved");
	const harness = HarnessSchema.parse(spec.harness);
	if (!isDeepStrictEqual(harness, spec.harness)) throw new Error("native_harness_conflict");
	const approved: ApprovedNativeOccurrence = {
		engineNodeId: visit.engineNodeId,
		inputReceipts: visit.inputReceipts,
		requestDigest: protocolDigest(input.requestBytes),
		specHash: request.specHash,
		taskKey: JSON.stringify([
			spec.taskKeyBase,
			request.nodeId,
			request.parentOccurrenceKey,
			request.phase,
			request.iterationPath.map(({ loopNodeId, round }) => [loopNodeId, round]),
		]),
		name: spec.name,
		instruction: spec.instruction,
		harness,
		...(spec.accountId === undefined ? {} : { accountId: spec.accountId }),
	};
	assembleNativePrompt(execution, request, approved);
	return approved;
}
