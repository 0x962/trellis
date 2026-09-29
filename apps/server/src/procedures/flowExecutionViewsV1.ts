import type { FlowExecutionViewV1 } from "@trellis/api";
import { os, type ProcedureContext } from "./base.ts";

export function createFlowExecutionViewV1(
	getView: (context: ProcedureContext, input: { id: string }) => Promise<FlowExecutionViewV1>,
) {
	return os.flowDocumentsV1.view.handler(({ context, input }) => getView(context, input));
}
