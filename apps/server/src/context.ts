import { ActorHeaderSchema, type ActorRef, actorHeaderGrammar } from "@trellis/api";
import { ulid } from "ulid";
import type { ProjectCache } from "./db/cache.ts";
import type { Emit } from "./db/tx.ts";
import { fail } from "./errors.ts";

// The poller and every internal batch act as this actor. The header
// `x-trellis-actor` accepts only `human` and `agent`, so a client can never
// pose as the system.
export const SYSTEM_ACTOR: ActorRef = { kind: "system", name: "trellis" };

// What one request carries into every service call. `now` is read once, so
// every row one transaction writes shares the same instant. `actor` is null
// on a request without the header; `requireActor` refuses a mutation then.
export type RequestContext = {
	actor: ActorRef | null;
	session: string | null;
	reqId: string;
	now: Date;
};

// The request context plus the process state a service needs. `emit` is the
// event collector of the open transaction. `cache` is the project tree with
// the status sets. `actorCache` maps `kind:name` to the last instant the
// actor row was written. `dropBlobs` queues the blob files of these hashes
// for removal after the commit. A file that an attachment row still names
// stays, and a rolled back transaction removes no file.
// `publicUrl` is the origin of every absolute link a service writes, because
// an agent reads a brief outside a browser.
export type ServiceCtx = RequestContext & {
	emit: Emit;
	cache: ProjectCache;
	actorCache: Map<string, number>;
	dropBlobs: (shas: string[]) => void;
	publicUrl: string;
};

export type CreateContextInput = {
	headers: Headers;
	reqId: string;
	clock?: () => Date;
};

const parseActor = (header: string): ActorRef => {
	const parsed = ActorHeaderSchema.safeParse(header);
	if (!parsed.success) throw fail("ACTOR_INVALID", { grammar: actorHeaderGrammar });
	return parsed.data;
};

export const createContext = ({ headers, reqId, clock = () => new Date() }: CreateContextInput): RequestContext => {
	const header = headers.get("x-trellis-actor");
	return {
		actor: header === null ? null : parseActor(header),
		session: headers.get("x-trellis-session"),
		reqId,
		now: clock(),
	};
};

export const requireActor = (ctx: RequestContext): ActorRef => {
	if (ctx.actor === null) throw fail("ACTOR_REQUIRED");
	return ctx.actor;
};

export const systemContext = (): RequestContext => ({
	actor: SYSTEM_ACTOR,
	session: null,
	reqId: ulid(),
	now: new Date(),
});

// The major version of the API contract. It travels in `x-trellis-api-version`
// and in the health answer. A change within one version only adds fields.
export const API_VERSION = "1";
