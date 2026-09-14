import type { FlowExecutionDecisionInput } from "@trellis/api";
import { advanceFlow } from "../../agents/nativeFlow/advanceFlow.ts";
import { taskKey } from "../../agents/nativeFlow/taskKey.ts";
import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { get, readExecution } from "./queries.ts";
import { saveState } from "./saveState.ts";
export async function decide(ctx: ServiceCtx, tx: Tx, input: FlowExecutionDecisionInput) {
	if (ctx.actor?.kind !== "human") throw invalidInput("actor", "A person must answer a human flow step.");
	const current = await readExecution(tx, input.id, true);
	if (current.revision !== input.expectedRevision) throw fail("FLOW_VERSION_CONFLICT", { version: current.revision });
	const step = current.state.steps.find((step) => taskKey(step) === input.key);
	if (step?.state !== "waiting_human") throw invalidInput("key", "This step is not waiting for a human decision.");
	const state = advanceFlow(
		current.doc,
		current.state,
		{ type: "human", key: input.key, approved: input.approved, output: input.output },
		ctx.now.getTime(),
	);
	await saveState(ctx, tx, current, state);
	return get(ctx, tx, input);
}
