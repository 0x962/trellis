import type { FlowSaveInput, FlowUpdateInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { get, resolveFlow, save, update } from "../../flows/flows.ts";
import { assertLegacy } from "../assertLegacy";
import { captureMetadata } from "../captureMetadata";
import { retainCurrent } from "../retainCurrent";

export const legacyServices = {
	get: async (ctx: ServiceCtx, tx: Tx, input: { flow: string }) => {
		const flow = await resolveFlow(tx, input.flow);
		await assertLegacy(ctx, tx, { flowId: flow.id, operation: "read" });
		return get(ctx, tx, input);
	},
	save: async (ctx: ServiceCtx, tx: Tx, input: FlowSaveInput) => {
		const flow = await resolveFlow(tx, input.flow);
		await assertLegacy(ctx, tx, { flowId: flow.id, operation: "write" });
		await retainCurrent(ctx, tx, flow);
		const saved = await save(ctx, tx, input);
		await captureMetadata(ctx, tx, saved.flow);
		return saved;
	},
	update: async (ctx: ServiceCtx, tx: Tx, input: FlowUpdateInput) => {
		await retainCurrent(ctx, tx, await resolveFlow(tx, input.flow));
		const updated = await update(ctx, tx, input);
		await captureMetadata(ctx, tx, updated);
		return updated;
	},
};
