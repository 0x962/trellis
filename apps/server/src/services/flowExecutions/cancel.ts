import type { FlowExecutionCancelInput } from "@trellis/api";
import { advanceFlow } from "../../agents/nativeFlow/advanceFlow.ts";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { get, readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
export async function cancel(ctx: ServiceCtx, tx: Tx, input: FlowExecutionCancelInput) {
	if (ctx.actor?.kind !== "human") throw invalidInput("actor", "A person must cancel a flow.");
	const current = await readExecution(tx, input.id, true);
	if (current.revision !== input.expectedRevision) throw fail("FLOW_VERSION_CONFLICT", { version: current.revision });
	await saveState(
		ctx,
		tx,
		current,
		advanceFlow(
			current.doc,
			current.state,
			{ type: "cancel", reason: "A person canceled this flow" },
			ctx.now.getTime(),
		),
	);
	return get(ctx, tx, input);
}
