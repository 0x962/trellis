import { type ListAuthorityExecutionsInput, listAuthorityExecutions } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { LangflowHostControl } from "../../../langflowHost";
import type { IoCtx } from "../../support";

export async function authorityExecutions(ctx: IoCtx, tx: Tx, input: ListAuthorityExecutionsInput) {
	if (ctx.actor.kind !== "system") throw new Error("langflow_internal_authority_required");
	if (LangflowHostControl.readIdentity(ctx.home).hostId !== input.hostId)
		throw new Error("langflow_bootstrap_identity_changed");
	return listAuthorityExecutions(tx, input);
}
