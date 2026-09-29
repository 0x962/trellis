import type { FlowRecoveryV1 } from "@trellis/api";
import type { Tx } from "../../../db/tx";
import { LangflowHostControl } from "../../../langflowHost";
import type { IoCtx } from "../../support";

export async function recovery(ctx: IoCtx, _tx: Tx): Promise<FlowRecoveryV1> {
	return LangflowHostControl.recovery(ctx.home);
}
