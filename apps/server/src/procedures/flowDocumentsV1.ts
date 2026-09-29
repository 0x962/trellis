import { implement, ORPCError, ValidationError } from "@orpc/server";
import type { FlowDocumentSaveV1Input, FlowDocumentV1, FlowExecutionViewV1 } from "@trellis/api";
import { ActorHeaderSchema, actorHeaderGrammar } from "@trellis/api";
import { flowDocumentsV1 } from "@trellis/api/contract";
import { fail, type InputIssue, invalidIssues } from "../errors.ts";
import type { ProcedureContext } from "./base.ts";

type Handlers = {
	get: (context: ProcedureContext, input: { flow: string }) => Promise<FlowDocumentV1>;
	save: (context: ProcedureContext, input: FlowDocumentSaveV1Input) => Promise<FlowDocumentV1>;
	view: (context: ProcedureContext, input: { id: string }) => Promise<FlowExecutionViewV1>;
};

export const createFlowDocumentsV1 = (handlers: Handlers) => {
	const base = implement(flowDocumentsV1).$context<ProcedureContext>();
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
	const validation = base.middleware(async ({ next }) => {
		try {
			return await next();
		} catch (error) {
			if (error instanceof ORPCError && error.code === "BAD_REQUEST" && error.cause instanceof ValidationError) {
				throw invalidIssues(error.cause.issues as InputIssue[]);
			}
			throw error;
		}
	});
	const routes = base.use(validation).use(actor);
	return routes.router({
		get: routes.get.handler(({ context, input }) => handlers.get(context, input)),
		save: routes.save.handler(({ context, input }) => handlers.save(context, input)),
		view: routes.view.handler(({ context, input }) => handlers.view(context, input)),
	});
};
