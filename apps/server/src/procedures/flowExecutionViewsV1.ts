import { implement } from "@orpc/server";
import type { FlowExecutionViewV1 } from "@trellis/api";
import { flowDocumentsV1 } from "@trellis/api/contract";
import type { ProcedureContext } from "./base.ts";

export function createFlowExecutionViewV1(
	getView: (context: ProcedureContext, input: { id: string }) => Promise<FlowExecutionViewV1>,
) {
	return implement(flowDocumentsV1.view)
		.$context<ProcedureContext>()
		.handler(({ context, input }) => getView(context, input));
}
