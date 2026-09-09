import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import pkg from "../package.json";
import type { contract } from "./contract/index.ts";
import { ActorHeaderSchema } from "./refs.ts";

export type TrellisClient = ContractRouterClient<typeof contract>;

// The shape the RPC link calls. `globalThis.fetch` fits it; a test passes a
// stub that records the request.
export type FetchLike = (request: Request, init: { redirect?: Request["redirect"] }) => Promise<Response>;

// The value of `x-trellis-client`. The server compares it with its own
// version and answers an older client with an error.
export const clientVersion = `api/${pkg.version}`;

// A typed client over the RPC handler at `<baseUrl>/rpc`. `actor` is the
// `x-trellis-actor` value and must match the header grammar; a bad actor
// throws here, before any request.
export const createTrellisClient = (
	baseUrl: string,
	actor: string,
	fetch: FetchLike = globalThis.fetch,
): TrellisClient => {
	ActorHeaderSchema.parse(actor);
	const link = new RPCLink({
		url: `${baseUrl}/rpc`,
		headers: { "x-trellis-actor": actor, "x-trellis-client": clientVersion },
		fetch: (request, init) => fetch(request, init),
	});
	return createORPCClient(link);
};
