import type { FlowExecutionStartInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { requireCurrentPublication } from "../../flowDocuments";
import { databaseStore } from "../databaseStore";
import { reserve } from "../reserve/reserve.ts";

export async function reserveStart(
	ctx: ServiceCtx,
	tx: Tx,
	input: FlowExecutionStartInput,
	options: { hostId: string },
) {
	return reserve(ctx, tx, input, {
		...options,
		store: databaseStore(ctx),
		requireCurrentPublication: async (context, transaction, request) => {
			const current = await requireCurrentPublication(context, transaction, request);
			const { publication: _state, lastExecutablePublication: _last, ...snapshot } = current.snapshot;
			return { snapshot, publication: current.publication };
		},
	});
}
