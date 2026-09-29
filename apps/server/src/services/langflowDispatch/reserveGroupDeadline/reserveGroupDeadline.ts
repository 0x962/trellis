import { lockExecution } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { LangflowHostControl, type LiveOwnership } from "../../../langflowHost";
import { type GroupDeadlineScope, reserveGroupDeadline } from "../../langflowClocks";
import type { IoCtx } from "../../support";

export async function reserveObservedGroupDeadline(
	ctx: IoCtx,
	tx: Tx,
	input: {
		request: GroupDeadlineScope;
		capabilityId: string;
		observation: LiveOwnership;
	},
) {
	if (ctx.actor.kind !== "system") throw new Error("langflow_internal_authority_required");
	const current = LangflowHostControl.readIdentity(ctx.home);
	const observed = input.observation.identity;
	if (current.dataHomeId !== observed.dataHomeId || current.hostId !== observed.hostId)
		throw new Error("langflow_bootstrap_identity_changed");
	const execution = await lockExecution(tx, input.request);
	const authority = execution.authority;
	if (
		authority === null ||
		execution.hostId !== observed.hostId ||
		authority.hostId !== observed.hostId ||
		authority.ownerId !== observed.ownerId
	)
		throw new Error("group_authority_conflict");
	return reserveGroupDeadline(ctx.core, tx, input);
}
