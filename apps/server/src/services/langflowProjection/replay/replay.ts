import type { ServiceCtx } from "../../../context.ts";
import { listEvents, readProjection } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";
import { type EventReplayRequestV1, EventReplayRequestV1Schema, EventReplayV1Schema } from "../../../langflowContracts";

export async function replay(_ctx: ServiceCtx, tx: Tx, input: EventReplayRequestV1) {
	const request = EventReplayRequestV1Schema.parse(input);
	const record = await readProjection(tx, request);
	if (!record) throw fail("NOT_FOUND", { kind: "flow execution", ref: request.executionId });
	const { view, firstAvailableSeq } = record;
	const gap = () =>
		EventReplayV1Schema.parse({
			version: 1,
			state: "gap",
			executionId: request.executionId,
			afterSeq: request.afterSeq,
			firstAvailableSeq,
			snapshotRevision: view.revision,
			snapshotLastSeq: view.lastEventSeq,
		});
	if (request.afterSeq < firstAvailableSeq - 1 || request.afterSeq > view.lastEventSeq) return gap();
	const events = await listEvents(tx, request);
	if (
		events.some((event, index) => event.seq !== request.afterSeq + index + 1) ||
		(events.length === 0 && request.afterSeq < view.lastEventSeq)
	)
		return gap();
	const nextSeq = events.at(-1)?.seq ?? request.afterSeq;
	return EventReplayV1Schema.parse({
		version: 1,
		state: "events",
		executionId: request.executionId,
		afterSeq: request.afterSeq,
		nextSeq,
		events,
		hasMore: nextSeq < view.lastEventSeq,
	});
}
