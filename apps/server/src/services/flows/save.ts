import type { FlowDoc, FlowSaveInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { upsert } from "../actors.ts";
import { assertVersion, readDoc, resolveFlow } from "./queries.ts";
import { replaceLegacyGraph } from "./replaceLegacyGraph";

export const save = async (ctx: ServiceCtx, tx: Tx, input: FlowSaveInput): Promise<FlowDoc> => {
	const actor = requireActor(ctx);
	const current = await resolveFlow(tx, input.flow);
	assertVersion(current, input.expectedVersion);
	await replaceLegacyGraph(ctx, tx, { current, graph: input });
	await tx.execute(sql`UPDATE flows SET version = version + 1, updated_at = ${ctx.now} WHERE id = ${current.id}`);
	await upsert(ctx, tx, actor);
	ctx.emit({ type: "flows.changed", id: current.id });
	return readDoc(tx, await resolveFlow(tx, current.id));
};
