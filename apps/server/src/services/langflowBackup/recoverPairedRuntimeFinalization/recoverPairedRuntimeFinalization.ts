import { nativeClient } from "../../../agents/native/connection";
import { LangflowHostControl } from "../../../langflowHost";
import type { IoCtx } from "../../support";
import { recoverRuntimeReceipt } from "./components/recoverRuntimeReceipt";

export function recoverPairedRuntimeFinalization(
	ctx: Pick<IoCtx, "home" | "actor">,
	input: { snapshotId: string },
) {
	if (ctx.actor.kind !== "system") throw new Error("paired_capture_requires_system_actor");
	return recoverRuntimeReceipt({
		control: LangflowHostControl.openCapture({ home: ctx.home }),
		runtime: nativeClient(ctx.home),
	}, input);
}
