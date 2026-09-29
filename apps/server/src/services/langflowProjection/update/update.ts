import { isDeepStrictEqual } from "node:util";
import type { ServiceCtx } from "../../../context.ts";
import {
	assertAuthority,
	commitProjection,
	findEvent,
	lockExecution,
	readProjection,
	readProjectionFacts,
} from "../../../db/queries/langflowExecution";
import { classificationStore } from "../../../db/queries/langflowExecution/classification.ts";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";
import {
	type DeliveryAuthorityV1,
	ExecutionEventV1Schema,
	protocolDigest,
	readProtocolBytes,
	SourceEventV1Schema,
} from "../../../langflowContracts";
import type { ProjectionObservation } from "../observation.ts";
import { project } from "../project.ts";

export type ProjectionUpdate = {
	executionId: string;
	authority: DeliveryAuthorityV1;
	observation: ProjectionObservation;
	sourceBytes: string | null;
};

export async function update(ctx: ServiceCtx, tx: Tx, input: ProjectionUpdate) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const execution = await lockExecution(tx, input);
	const stored = await readProjection(tx, input);
	if (!stored) throw fail("NOT_FOUND", { kind: "flow execution", ref: input.executionId });
	const source = input.sourceBytes === null ? null : readProtocolBytes(SourceEventV1Schema, input.sourceBytes);
	if (
		source &&
		(source.executionId !== input.executionId ||
			source.publicationId !== execution.publicationId ||
			source.engineJobId !== execution.engineJobId)
	) {
		throw new Error("identity_conflict");
	}
	if (source) {
		const duplicate = await findEvent(tx, source);
		if (duplicate) {
			if (duplicate.sourceDigest !== protocolDigest(input.sourceBytes!)) throw new Error("identity_conflict");
			return { state: "duplicate" as const, event: duplicate, view: stored.view };
		}
	}
	await assertAuthority(tx, execution, input.authority, "events.append", ctx.now);
	if (source && source.engineEpoch !== input.authority.engineEpoch) throw new Error("stale_owner");
	if (
		source?.occurrence &&
		!input.observation.occurrences.some((row) => {
			const { nodeId, occurrenceKey, parentOccurrenceKey, phase, iterationPath } = row;
			return isDeepStrictEqual(source.occurrence, { nodeId, occurrenceKey, parentOccurrenceKey, phase, iterationPath });
		})
	)
		throw new Error("receipt_mismatch");
	const facts = await readProjectionFacts(tx, input);
	const seq = stored.view.lastEventSeq + (source ? 1 : 0);
	const event = source
		? ExecutionEventV1Schema.parse({ ...source, seq, sourceDigest: protocolDigest(input.sourceBytes!) })
		: null;
	const view = project(
		{
			...stored.view,
			submission: {
				requestId: execution.submission.requestId,
				state: execution.submission.state,
				admission: execution.admission.state,
				engineJobId: execution.engineJobId,
				engineEpoch: input.authority.engineEpoch,
				ownership: "confirmed",
				error: null,
			},
		},
		input.observation,
		{
			classification: await classificationStore.read(tx, input),
			native: facts.native,
			human: facts.humanDeliveries,
			stops: facts.stops,
			deadlines: facts.deadlines,
		},
		input.authority,
		seq,
		ctx.now,
	);
	if (execution.cancelIntent && view.status !== "canceled") throw new Error("execution_canceled");
	await commitProjection(tx, {
		executionId: input.executionId,
		expectedRevision: stored.view.revision,
		checkpoint: input.observation.checkpoint,
		view,
		event,
		sourceBytes: input.sourceBytes,
	});
	ctx.emit({ type: "flows.changed", id: view.flowId });
	return { state: "updated" as const, event, view };
}
