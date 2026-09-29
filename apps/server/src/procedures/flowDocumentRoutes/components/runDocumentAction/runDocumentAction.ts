import { ORPCError } from "@orpc/server";
import type { DocumentActionReceiptInput } from "../../../../services/flowDocuments";
import type { ProcedureContext } from "../../../base";

export function runDocumentAction(context: ProcedureContext, input: DocumentActionReceiptInput) {
	if (!context.documentActions) throw new ORPCError("FLOW_RUNTIME_UNAVAILABLE", { status: 503, defined: true });
	return context.documentActions.run(
		input,
		{
			actor: context.actor,
			session: context.headers.get("x-trellis-session"),
			attemptToken: context.headers.get("x-trellis-attempt"),
			reqId: context.reqId,
			now: new Date(),
		},
		context.timing,
	);
}
