import type { FlowDoc, FlowSaveInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { upsert } from "../actors.ts";
import { assertLegacy } from "../flowDocuments/assertLegacy.ts";
import { replaceLegacyGraph } from "../flowDocuments/replaceLegacyGraph.ts";
import { captureMetadata } from "../flowDocuments/captureMetadata.ts";
import { retainCurrent } from "../flowDocuments/retainCurrent.ts";
import { assertVersion, readDoc, resolveFlow } from "./queries.ts";

export const save = async (ctx: ServiceCtx, tx: Tx, input: FlowSaveInput): Promise<FlowDoc> => {
	const actor = requireActor(ctx);
	const current = await resolveFlow(tx, input.flow);
	await assertLegacy(ctx, tx, { flowId: current.id, operation: "write" });
	assertVersion(current, input.expectedVersion);
	await retainCurrent(ctx, tx, current);
	await replaceLegacyGraph(ctx, tx, { current, graph: input });
	await tx.execute(sql`UPDATE flows SET version = version + 1, updated_at = ${ctx.now} WHERE id = ${current.id}`);
	await upsert(ctx, tx, actor);
	const flow = await resolveFlow(tx, current.id);
	await captureMetadata(ctx, tx, flow);
	ctx.emit({ type: "flows.changed", id: current.id });
	return readDoc(tx, flow);
};
