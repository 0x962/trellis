import { createNativeDispatchGate } from "../../langflowNative";
import { createNativeRuntimeWorker } from "../../langflowNative/runtime";
import { recordWorkspace } from "../../langflowProjection";
import { actionControl } from "../actionControl";

export const nativeRuntimeWorker = createNativeRuntimeWorker({
	recordWorkspace,
	dispatchGate: async (ctx) => {
		const control = actionControl(ctx.home);
		return createNativeDispatchGate({
			newTx: ctx.newTx,
			dataHomeId: control.identity.dataHomeId,
			gate: control.gate,
			archive: control.archive,
		});
	},
});
