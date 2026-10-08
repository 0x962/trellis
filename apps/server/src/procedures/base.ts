import { implement, ORPCError, ValidationError } from "@orpc/server";
import { ActorHeaderSchema, type ActorRef, actorHeaderGrammar, contract } from "@trellis/api";
import type { RequestContext } from "../context.ts";
import type { ServiceTransport } from "../db/transport.ts";
import { fail, type InputIssue, invalidInput, invalidIssues } from "../errors.ts";
import type { GhAccess } from "../ghState.ts";
import type { DbTiming } from "../serverTiming.ts";
import type { ServiceName } from "../services/registry.ts";

// What the HTTP layer hands every procedure. `actor` is null until the
// actor middleware parses the header. `resHeaders` comes from the response
// headers plugin; a create sets `Location` on it. `timing` belongs to the
// HTTP request, so every procedure of a batch adds to the same one.
// `chooseDirectory` opens the folder picker of the machine. It is here and
// not in a service, because the picker blocks until a person answers and the
// database worker must serve every other request while it waits. `gh` reads
// and checks the gh state for the same reason: `gh auth status` can take
// seconds.
export type ProcedureContext = {
	headers: Headers;
	reqId: string;
	transport: ServiceTransport;
	actor: ActorRef | null;
	timing: DbTiming;
	resHeaders?: Headers;
	chooseDirectory: () => Promise<string | null>;
	gh: GhAccess;
};

const base = implement(contract).$context<ProcedureContext>();

// A GET accepts an optional actor header. A missing or malformed GET header
// gives the service a null actor. A mutation requires a valid actor header.
const requireActor = base.middleware(async ({ context, next, procedure }) => {
	const method = procedure["~orpc"].route.method ?? "POST";
	const header = context.headers.get("x-trellis-actor");
	if (method === "GET") {
		const parsed = ActorHeaderSchema.safeParse(header);
		return next({ context: { actor: parsed.success ? parsed.data : null } });
	}
	if (header === null) throw fail("ACTOR_REQUIRED");
	const parsed = ActorHeaderSchema.safeParse(header);
	if (!parsed.success) throw fail("ACTOR_INVALID", { grammar: actorHeaderGrammar });
	return next({ context: { actor: parsed.data } });
});

// oRPC reports a schema failure as BAD_REQUEST. The contract declares
// INPUT_VALIDATION_FAILED with the same issues, so the client sees one code.
const declaredValidation = base.middleware(async ({ next }) => {
	try {
		return await next();
	} catch (error) {
		if (error instanceof ORPCError && error.code === "BAD_REQUEST" && error.cause instanceof ValidationError) {
			throw invalidIssues(error.cause.issues as InputIssue[]);
		}
		throw error;
	}
});

// Both middlewares sit before the input validation of every procedure. A
// mutation without the actor header answers ACTOR_REQUIRED before a schema runs.
export const os = base.use(declaredValidation).use(requireActor);

// Runs one service through the transport with the context of this request.
export const call = <T>(context: ProcedureContext, name: ServiceName, input: unknown): Promise<T> => {
	const ctx: RequestContext = {
		actor: context.actor,
		session: context.headers.get("x-trellis-session"),
		attemptToken: context.headers.get("x-trellis-attempt"),
		reqId: context.reqId,
		now: new Date(),
	};
	return context.transport.call(name, ctx, input, context.timing) as Promise<T>;
};

export const setLocation = (context: ProcedureContext, path: string) => {
	context.resHeaders?.set("location", path);
};

const IF_MATCH = /^\s*"?(\d+)"?\s*$/;

// `If-Match: "<version>"` is the header form of `expectedVersion`. When both
// are present they must agree.
export const withIfMatch = <T extends { expectedVersion?: number }>(context: ProcedureContext, input: T): T => {
	const header = context.headers.get("if-match");
	if (header === null) return input;
	const match = IF_MATCH.exec(header);
	if (match === null)
		throw invalidInput("If-Match", 'If-Match must be the current version in quotes, for example If-Match: "3".');
	const version = Number(match[1]);
	if (input.expectedVersion !== undefined && input.expectedVersion !== version) {
		throw invalidInput(
			"expectedVersion",
			"If-Match and expectedVersion have different versions. Send one of them, or send the same version in both.",
		);
	}
	return { ...input, expectedVersion: version };
};
