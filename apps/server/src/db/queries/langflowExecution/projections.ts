import { isDeepStrictEqual } from "node:util";
import type { FlowExecutionViewV1 } from "@trellis/api";
import { and, asc, eq, gt, gte } from "drizzle-orm";
import { type EngineCheckpointV1, type ExecutionEventV1, protocolDigest } from "../../../langflowContracts";
import {
	langflowSourceEvents as events,
	langflowExecutionProjections as projections,
} from "../../tables/langflowExecution";
import type { Tx } from "../../tx";
import { lockExecution } from "./executions";

export async function readProjection(tx: Tx, input: { executionId: string }) {
	const [row] = await tx.select().from(projections).where(eq(projections.executionId, input.executionId));
	return row ? { view: row.view, firstAvailableSeq: row.firstAvailableSeq } : null;
}
export async function initializeProjection(tx: Tx, input: { view: FlowExecutionViewV1 }) {
	const execution = await lockExecution(tx, { executionId: input.view.id });
	if (
		!isDeepStrictEqual(input.view.snapshot, execution.snapshot) ||
		!isDeepStrictEqual(input.view.publication, execution.publication)
	)
		throw new Error("projection_identity_conflict");
	await tx.insert(projections).values({
		executionId: input.view.id,
		view: input.view,
		revision: input.view.revision,
		lastEventSeq: input.view.lastEventSeq,
		firstAvailableSeq: 1,
	});
}
export async function findEvent(tx: Tx, input: { engineJobId: string; sourceEventId: string }) {
	const [row] = await tx
		.select()
		.from(events)
		.where(and(eq(events.engineJobId, input.engineJobId), eq(events.sourceEventId, input.sourceEventId)));
	return row?.event ?? null;
}
export async function commitProjection(
	tx: Tx,
	input: {
		executionId: string;
		expectedRevision: number;
		view: FlowExecutionViewV1;
		event: ExecutionEventV1 | null;
		sourceBytes: string | null;
		checkpoint?: EngineCheckpointV1;
	},
) {
	const execution = await lockExecution(tx, input);
	const current = await readProjection(tx, input);
	if (!current || current.view.revision !== input.expectedRevision) throw new Error("projection_conflict");
	const { view, event, sourceBytes } = input;
	if (input.checkpoint) {
		const checkpoint = input.checkpoint;
		const previous = await readCheckpoint(tx, input);
		if (
			checkpoint.executionId !== input.executionId ||
			checkpoint.publicationId !== execution.publicationId ||
			checkpoint.engineJobId !== execution.engineJobId ||
			checkpoint.engineEpoch !== execution.authority?.engineEpoch ||
			(previous &&
				(checkpoint.revision < previous.revision ||
					(checkpoint.revision === previous.revision && !isDeepStrictEqual(checkpoint, previous))))
		)
			throw new Error("checkpoint_conflict");
	}
	if (
		!isDeepStrictEqual(view.snapshot, execution.snapshot) ||
		!isDeepStrictEqual(view.publication, execution.publication) ||
		view.flowId !== execution.flowId ||
		view.ticketId !== execution.ticketId
	)
		throw new Error("projection_identity_conflict");
	if (
		view.id !== input.executionId ||
		view.revision !== input.expectedRevision + 1 ||
		view.lastEventSeq !== current.view.lastEventSeq + (event ? 1 : 0)
	)
		throw new Error("projection_conflict");
	if (event) {
		if (
			sourceBytes === null ||
			protocolDigest(sourceBytes) !== event.sourceDigest ||
			event.executionId !== input.executionId ||
			event.seq !== view.lastEventSeq ||
			event.publicationId !== execution.publicationId ||
			event.engineJobId !== execution.engineJobId ||
			event.engineEpoch !== execution.authority?.engineEpoch
		)
			throw new Error("event_conflict");
		const { seq: _seq, sourceDigest: _digest, ...source } = event;
		if (!isDeepStrictEqual(JSON.parse(sourceBytes), source)) throw new Error("event_bytes_conflict");
		const existing = await findEvent(tx, event);
		if (existing) throw new Error("event_already_recorded");
		await tx.insert(events).values({
			executionId: input.executionId,
			engineJobId: event.engineJobId,
			sourceEventId: event.sourceEventId,
			sourceIdentityDigest: protocolDigest(event.sourceEventId),
			sourceBytes,
			event,
			seq: event.seq,
		});
	}
	await tx
		.update(projections)
		.set({
			view,
			revision: view.revision,
			lastEventSeq: view.lastEventSeq,
			...(input.checkpoint ? { checkpoint: input.checkpoint } : {}),
		})
		.where(eq(projections.executionId, input.executionId));
	return { view, firstAvailableSeq: current.firstAvailableSeq };
}
export async function listEvents(tx: Tx, input: { executionId: string; afterSeq: number; limit: number }) {
	const current = await readProjection(tx, input);
	const rows = await tx
		.select()
		.from(events)
		.where(
			and(
				eq(events.executionId, input.executionId),
				gt(events.seq, input.afterSeq),
				gte(events.seq, current!.firstAvailableSeq),
			),
		)
		.orderBy(asc(events.seq))
		.limit(input.limit);
	return rows.map((row) => row.event);
}
export async function retainEvents(tx: Tx, input: { executionId: string; firstAvailableSeq: number }) {
	await lockExecution(tx, input);
	const current = await readProjection(tx, input);
	if (
		!current ||
		input.firstAvailableSeq < current.firstAvailableSeq ||
		input.firstAvailableSeq > current.view.lastEventSeq + 1
	)
		throw new Error("cursor_conflict");
	await tx
		.update(projections)
		.set({ firstAvailableSeq: input.firstAvailableSeq })
		.where(eq(projections.executionId, input.executionId));
}

export async function readCheckpoint(tx: Tx, input: { executionId: string }) {
	const [row] = await tx
		.select({ checkpoint: projections.checkpoint })
		.from(projections)
		.where(eq(projections.executionId, input.executionId));
	return row?.checkpoint ?? null;
}
