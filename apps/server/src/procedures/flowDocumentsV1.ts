import { implement } from "@orpc/server";
import {
	ActorHeaderSchema,
	actorHeaderGrammar,
	type FlowDocumentSaveV1Input,
	type FlowDocumentV1,
	type FlowExecutionViewV1,
} from "@trellis/api";
import { fail } from "../errors.ts";
import { flowDocumentsV1 as contract } from "@trellis/api/contract";
import type { ProcedureContext } from "./base.ts";

type Handlers = {
	get: (context: ProcedureContext, input: { flow: string }) => Promise<FlowDocumentV1>;
	save: (context: ProcedureContext, input: FlowDocumentSaveV1Input) => Promise<FlowDocumentV1>;
	view: (context: ProcedureContext, input: { id: string }) => Promise<FlowExecutionViewV1>;
};

export const createFlowDocumentsV1 = (handlers: Handlers) => {
	const base = implement(contract).$context<ProcedureContext>();
	const actor = base.middleware(async ({ context, next, procedure }) => {
		const header = context.headers.get("x-trellis-actor");
		const parsed = ActorHeaderSchema.safeParse(header);
		if (procedure["~orpc"].route.method === "GET") {
			return next({ context: { actor: parsed.success ? parsed.data : null } });
		}
		if (header === null) throw fail("ACTOR_REQUIRED");
		if (!parsed.success) throw fail("ACTOR_INVALID", { grammar: actorHeaderGrammar });
		return next({ context: { actor: parsed.data } });
	});
	const os = base.use(actor);
	return os.router({
		get: os.get.handler(({ context, input }) => handlers.get(context, input)),
		save: os.save.handler(({ context, input }) => handlers.save(context, input)),
		view: os.view.handler(({ context, input }) => handlers.view(context, input)),
	});
};
