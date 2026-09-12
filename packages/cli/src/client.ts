import { ORPCError } from "@orpc/client";
import { createTrellisClient, type TrellisClient } from "@trellis/api/client";
import cliPkg from "../package.json" with { type: "json" };
import type { CliContext } from "./context.ts";
import { serverOlder, unreachable } from "./errors.ts";
import type { Deps } from "./index.ts";

export type ClientOptions = {
	url: string;
	actor: string;
	session?: string | undefined;
	fetch: Deps["fetch"];
	// Fires on Ctrl-C. Every request carries it, so one interrupt ends the
	// request in flight instead of leaving the process waiting for an answer.
	signal: AbortSignal;
	apiVersion: string;
};

// The value of `x-trellis-client`.
export const clientVersion = `cli/${cliPkg.version}`;

// Compares two dotted numeric versions: negative when `a` is older than `b`.
export const compareVersions = (a: string, b: string): number => {
	const left = a.split(".").map(Number);
	const right = b.split(".").map(Number);
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const diff = (left[index] ?? 0) - (right[index] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
};

// The fetch every request goes through. It adds the three trellis headers
// and reads `x-trellis-api-version` from the answer. A connection failure
// and an answer without the header both mean no trellis server is on the
// port. A server whose api is older than this CLI is refused.
export const trellisFetch =
	(options: ClientOptions): Deps["fetch"] =>
	async (request, init) => {
		request.headers.set("x-trellis-actor", options.actor);
		request.headers.set("x-trellis-client", clientVersion);
		if (options.session !== undefined) request.headers.set("x-trellis-session", options.session);
		let response: Response;
		try {
			response = await options.fetch(request, { ...init, signal: options.signal });
		} catch {
			throw unreachable(options.url);
		}
		const serverVersion = response.headers.get("x-trellis-api-version");
		if (serverVersion === null) throw unreachable(options.url);
		if (compareVersions(serverVersion, options.apiVersion) < 0) throw serverOlder(serverVersion, options.apiVersion);
		return response;
	};

// The routes outside the RPC handler (`/api/events`, `/api/export`) answer
// an error as JSON `{code, message, data}` with the error's HTTP status. The
// body becomes the contract error, so it prints and exits the way an RPC
// error does.
export const throwErrorAnswer = async (response: Response): Promise<never> => {
	const body = (await response.json()) as { code: string; message: string; data?: unknown };
	throw new ORPCError(body.code, { message: body.message, data: body.data, status: response.status });
};

export const createClient = (options: ClientOptions): TrellisClient =>
	createTrellisClient(options.url, options.actor, trellisFetch(options));

export const clientOptions = (ctx: CliContext): ClientOptions => {
	const actor = ctx.actor();
	return {
		url: ctx.url,
		actor: actor.actor,
		session: ctx.deps.env.TRELLIS_SESSION ?? actor.session ?? undefined,
		fetch: ctx.deps.fetch,
		signal: ctx.deps.signal,
		apiVersion: ctx.deps.apiVersion,
	};
};

export const clientOf = (ctx: CliContext): TrellisClient => createClient(clientOptions(ctx));
