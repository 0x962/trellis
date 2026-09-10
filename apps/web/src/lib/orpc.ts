import { BatchLinkPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { createTrellisClient, type FetchLike } from "@trellis/api";
import { actorHeader } from "./actor";

export type OrpcOptions = {
	// The transport. A test passes the fake server's `app.request`.
	fetch?: FetchLike;
	// The origin the client addresses. The page's own origin by default: the
	// dev server proxies /rpc and /api to the API, so no request crosses an
	// origin.
	baseUrl?: string;
};

// SSE keeps every cached entity current, so a query never refetches by
// age and never retries on its own.
export const createQueryClient = () =>
	new QueryClient({
		defaultOptions: {
			queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
			mutations: { retry: false },
		},
	});

// The typed client, the TanStack Query utils over it, and a QueryClient.
// The batch link folds calls from one tick. A ticket detail read starts
// immediately to meet the ticket-open budget. The actor header is read from
// localStorage on every request, so a rename takes effect on the next call.
export const createOrpc = (options: OrpcOptions = {}) => {
	const fetch: FetchLike = options.fetch ?? ((request, init) => globalThis.fetch(request, init));
	const baseUrl = options.baseUrl ?? window.location.origin;
	const client = createTrellisClient(baseUrl, actorHeader, fetch, {
		plugins: [
			new BatchLinkPlugin({
				groups: [{ condition: () => true, context: {} }],
				mode: "buffered",
				exclude: ({ path }) => path[0] === "tickets" && path[1] === "get",
			}),
		],
	});
	const orpc = createTanstackQueryUtils(client);
	const queryClient = createQueryClient();
	return { client, orpc, queryClient };
};

export type Orpc = ReturnType<typeof createOrpc>["orpc"];

// The app's own instances. Tests build theirs with `createOrpc`.
export const { client, orpc, queryClient } = createOrpc();
