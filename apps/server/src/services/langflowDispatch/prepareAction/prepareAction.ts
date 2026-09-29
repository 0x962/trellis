import { requireActor } from "../../../context";
import { withTx } from "../../../db/tx";
import type { IoCtx } from "../../support";
import { actionControl } from "../actionControl";
import { type ActionRequest, actionRequest } from "../actionRequest";
import { settleAction } from "../settleAction";
import { actionPermit } from "./components/actionPermit";
import { recordAction } from "./components/recordAction";

export async function prepareAction(ctx: IoCtx, action: ActionRequest) {
	const request = actionRequest(requireActor(ctx.core), action);
	const control = actionControl(ctx.home);
	const { permit, replay } = actionPermit(control.gate, request.binding);
	if (!replay)
		await withTx(
			{ transaction: ctx.newTx },
			(tx, emit) =>
				recordAction({ ...ctx.core, emit }, tx, { action, request, permit, hostId: control.identity.hostId }),
			(events) => {
				for (const event of events) ctx.emit(event);
			},
		);
	return settleAction(ctx, control, permit);
}
