import { isDeepStrictEqual } from "node:util";
import type { ServiceCtx } from "../../../context";
import { lockExecution, readEngineSnapshot, readProjection } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { DeliveryAuthorityV1Schema, EngineProjectionSnapshotV1Schema, protocolDigest, SourceEventV1Schema } from "../../../langflowContracts";
import { EngineProjectionResponseV1Schema } from "../engineObservation/schema";
import type { PreparedProjection } from "../projectionState";
import { readObservation } from "../readObservation";
import { update } from "../update";

export async function applyEngineObservation(
	ctx: ServiceCtx,
	tx: Tx,
	input: { prepared: PreparedProjection; authorityBytes: string; responseBytes: string },
) {
	if (ctx.actor?.kind !== "system") throw new Error("authority_conflict");
	const { prepared } = input;
	const execution = await lockExecution(tx, prepared);
	const stored = await readProjection(tx, prepared);
	const previous = await readEngineSnapshot(tx, prepared);
	if (!stored || stored.view.revision !== prepared.expectedRevision ||
		(previous?.sourceCursor ?? 0) !== prepared.after || !isDeepStrictEqual(execution.authority, prepared.authority))
		throw new Error("projection_conflict");
	const authority = DeliveryAuthorityV1Schema.parse(JSON.parse(input.authorityBytes));
	if (!isDeepStrictEqual(authority, prepared.authority)) throw new Error("authority_conflict");
	const response = EngineProjectionResponseV1Schema.parse(JSON.parse(input.responseBytes));
	if (response.authorityDigest !== protocolDigest(input.authorityBytes)) throw new Error("authority_conflict");
	if (response.state === "unavailable") return { state: "unavailable" as const, reason: response.reason };
	if (response.state === "unchanged" && (response.sourceCursor !== prepared.after || previous === null))
		throw new Error("projection_cursor_conflict");
	const snapshotBytes = response.state === "unchanged" ? previous!.snapshotBytes : response.snapshotBytes;
	const snapshot = EngineProjectionSnapshotV1Schema.parse(JSON.parse(snapshotBytes));
	for (const field of ["executionId", "publicationId", "engineJobId"] as const)
		if (snapshot[field] !== prepared[field]) throw new Error("projection_binding_conflict");
	if (snapshot.engineEpoch !== authority.engineEpoch) throw new Error("stale_owner");
	let sourceBytes: string | null = null;
	if (response.state !== "unchanged") {
		if (protocolDigest(snapshotBytes) !== response.snapshotDigest ||
			protocolDigest(response.sourceBytes) !== response.sourceDigest ||
			snapshot.sourceCursor !== response.sourceCursor || response.sourceCursor <= prepared.after ||
			(response.state === "snapshot" && response.sourceCursor !== prepared.after + 1))
			throw new Error("projection_cursor_conflict");
		const source = SourceEventV1Schema.parse(JSON.parse(response.sourceBytes));
		const checkpoint: { checkpointId: string; revision: number } = JSON.parse(snapshot.checkpointBytes);
		if (source.executionId !== snapshot.executionId || source.publicationId !== snapshot.publicationId ||
			source.engineJobId !== snapshot.engineJobId || source.engineEpoch !== snapshot.engineEpoch ||
			source.payload.kind !== "checkpoint_saved" || source.payload.receiptId !== checkpoint.checkpointId ||
			source.sourceEventId !== checkpoint.checkpointId || checkpoint.revision !== snapshot.sourceCursor)
			throw new Error("projection_event_binding_conflict");
		sourceBytes = response.sourceBytes;
	}
	const result = await update(ctx, tx, {
		executionId: prepared.executionId,
		authority,
		observation: readObservation(execution, snapshot, prepared.expectedRevision),
		sourceBytes,
		engineSnapshot: { sourceCursor: snapshot.sourceCursor, snapshotBytes },
	});
	if (result.state === "duplicate") throw new Error("projection_cursor_conflict");
	return { state: response.state === "unchanged" ? "unchanged" as const : "advanced" as const, view: result.view };
}
