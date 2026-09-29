import type { FlowExecutionStartInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx, SYSTEM_ACTOR } from "../../../context";
import type { Tx } from "../../../db/tx";
import { get as getDocument } from "../../flowDocuments";
import { resolveFlow } from "../../flows/flows";
import { initialize } from "../../langflowProjection";
import { databaseStore, reserveStart } from "../../langflowStart";
import { getView } from "../getView";
import { startLegacy } from "../startLegacy";

export async function startView(ctx: ServiceCtx, tx: Tx, input: FlowExecutionStartInput, options: { hostId: string }) {
	const actor = requireActor(ctx);
	const prior = await databaseStore(ctx).readRequest(tx, {
		actorKind: actor.kind,
		actorName: actor.name,
		requestId: input.requestId,
	});
	if (prior === null) {
		const flow = await resolveFlow(tx, input.flow);
		await tx.execute(sql`SELECT id FROM flows WHERE id=${flow.id} FOR UPDATE`);
		const document = await getDocument(ctx, tx, { flow: flow.id });
		if (document.engine === "legacy") {
			const execution = await startLegacy(ctx, tx, input);
			return getView(ctx, tx, { id: execution.id });
		}
	}
	const reservation = await reserveStart(ctx, tx, input, options);
	if (reservation.execution.engine === "langflow")
		await initialize({ ...ctx, actor: SYSTEM_ACTOR }, tx, { executionId: reservation.execution.executionId });
	return getView(ctx, tx, { id: reservation.execution.executionId });
}
