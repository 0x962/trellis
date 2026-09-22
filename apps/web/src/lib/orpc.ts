import { BatchLinkPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { notifyManager, QueryClient } from "@tanstack/react-query";
import { createTrellisClient, type FetchLike } from "@trellis/api";
import { actorHeader } from "./actor";
import { queryRetryDelay } from "./queryRetry";

export type OrpcOptions = {
	// The transport. A test passes the fake server's `app.request`.
	fetch?: FetchLike;
	// The origin the client addresses. The page's own origin by default: the
	// dev server proxies /rpc and /api to the API, so no request crosses an
	// origin.
	baseUrl?: string;
};

// A cache write reaches its observers in the same call. A live patch or
// an optimistic write then repaints in the same task, so a row never lags
// its cache by a timer.
notifyManager.setScheduler((callback) => callback());

// SSE keeps every cached entity current, so a query never refetches by
// age and never retries on its own.
export const createQueryClient = () =>
	new QueryClient({
		defaultOptions: {
			queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
			mutations: { retry: false },
		},
	});

// Ticket details and status options start outside the batch, so slower reads cannot delay these controls.
const unbatched = new Set([
	"tickets.get",
	"statuses.list",
	"reviews.refresh",
	"reviews.status",
	"reviews.file",
	"reviews.metadata",
	"reviews.mine",
]);

// The typed client, the TanStack Query utils over it, and a QueryClient.
// The batch link folds calls from one tick, except the reads above. The
// batch streams: each answer reaches its query when its own call finishes,
// so a slow call in a batch never holds back the others. The actor header
// is read from localStorage on every request, so a rename takes effect on
// the next call.
export const createOrpc = (options: OrpcOptions = {}) => {
	const fetch: FetchLike = options.fetch ?? ((request, init) => globalThis.fetch(request, init));
	const baseUrl = options.baseUrl ?? window.location.origin;
	const client = createTrellisClient(baseUrl, actorHeader, fetch, {
		plugins: [
			new BatchLinkPlugin({
				groups: [{ condition: () => true, context: {} }],
				mode: "streaming",
				exclude: ({ path }) => unbatched.has(path.join(".")),
			}),
		],
	});
	const orpc = createTanstackQueryUtils(client);
	const queryClient = createQueryClient();
	const listRetryOptions = { retry: true, retryDelay: queryRetryDelay };
	for (const queryKey of [
		orpc.projects.list.key(),
		orpc.sessions.list.key(),
		orpc.sessions.activity.key(),
		orpc.tickets.list.key(),
		orpc.tickets.board.key(),
		orpc.tickets.counts.key(),
		orpc.needsYou.summary.key(),
		orpc.needsYou.list.key(),
		orpc.reviews.prs.key(),
		orpc.reviews.mine.key(),
		orpc.epics.list.key(),
		orpc.settings.get.key(),
	]) {
		queryClient.setQueryDefaults(queryKey, listRetryOptions);
	}
	return { client, orpc, queryClient };
};

export type Orpc = ReturnType<typeof createOrpc>["orpc"];

// The app's own instances. Tests build theirs with `createOrpc`.
export const { client, orpc, queryClient } = createOrpc();
