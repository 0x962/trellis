import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { StandardLinkPlugin } from "@orpc/client/standard";
import type { ContractRouterClient } from "@orpc/contract";
import pkg from "../package.json" with { type: "json" };
import type { contract } from "./contract/index.ts";
import { ActorHeaderSchema } from "./refs.ts";

export type TrellisClient = ContractRouterClient<typeof contract>;

// The shape the RPC link calls. `globalThis.fetch` fits it; a test passes a
// stub that records the request.
export type FetchLike = (request: Request, init: { redirect?: Request["redirect"] }) => Promise<Response> | Response;

// The actor a client sends: a fixed header value, or a function read on
// every request. The function returns null before an identity exists, and
// then the request carries no actor header.
export type ActorSource = string | (() => string | null);

export type TrellisClientOptions = {
	// Link plugins, such as a BatchLinkPlugin that folds one tick's calls
	// into one request.
	plugins?: StandardLinkPlugin<Record<never, never>>[];
};

// The value of `x-trellis-client`. The server compares it with its own
// version and answers an older client with an error.
export const clientVersion = `api/${pkg.version}`;

// A batch goes to `<baseUrl>/rpc/__batch__`. A BatchLinkPlugin without a
// `url` option aims at the first call's own path plus `/__batch__`, so this
// plugin runs after it and rewrites that URL. It sits after every other
// plugin, so it sees the batch request and not the calls inside it.
const batchUrlPlugin = (baseUrl: string): StandardLinkPlugin<Record<never, never>> => ({
	order: 10_000_000,
	init: (options) => {
		options.clientInterceptors ??= [];
		options.clientInterceptors.push((interceptorOptions) => {
			const { request } = interceptorOptions;
			if (!request.url.pathname.endsWith("/__batch__")) return interceptorOptions.next();
			return interceptorOptions.next({
				...interceptorOptions,
				request: { ...request, url: new URL(`${baseUrl}/rpc/__batch__`) },
			});
		});
	},
});

// One batch request carries many calls, and the host answers all of them
// together. The host refuses a request before any call runs: a missing or
// wrong host token answers 401, and a browser origin or a hostname the host
// does not serve answers 403. That answer is one error body for the whole
// request, and not the list of per-call answers that the batch reader
// expects, so the reader throws "Invalid batch response" and the status is
// lost. This builds the error that an unbatched call throws, so every caller
// reads the same code and the same status from a refusal.
export const batchRefusal = (url: string, status: number): ORPCError<string, unknown> | undefined => {
	if (status >= 200 && status < 400) return;
	if (!new URL(url).pathname.endsWith("/__batch__")) return;
	const code = status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR";
	return new ORPCError(code, { status, message: `The Trellis host answered the batch request with ${status}.` });
};

// A typed client over the RPC handler at `<baseUrl>/rpc`. A fixed `actor`
// is the `x-trellis-actor` value and must match the header grammar; a bad
// actor throws here, before any request.
export const createTrellisClient = (
	baseUrl: string,
	actor: ActorSource,
	fetch: FetchLike = globalThis.fetch,
	options: TrellisClientOptions = {},
): TrellisClient => {
	if (typeof actor === "string") ActorHeaderSchema.parse(actor);
	const headers = () => {
		const value = typeof actor === "string" ? actor : actor();
		return value === null
			? { "x-trellis-client": clientVersion }
			: { "x-trellis-actor": value, "x-trellis-client": clientVersion };
	};
	const link = new RPCLink({
		url: `${baseUrl}/rpc`,
		headers,
		fetch: async (request, init) => {
			const response = await fetch(request, init);
			const refusal = batchRefusal(request.url, response.status);
			if (refusal) throw refusal;
			return response;
		},
		plugins: [...(options.plugins ?? []), batchUrlPlugin(baseUrl)],
	});
	return createORPCClient(link);
};

export { reviewHref, reviewRef } from "./reviewRef";
