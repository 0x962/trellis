import { QueryClient } from "@tanstack/react-query";

// Every entity the stream patches stays fresh until an event says otherwise,
// so a query never refetches on its own. A day of garbage-collection time
// keeps a query alive long enough to reach the persisted snapshot. A failed
// request or mutation settles at once: the unreachable-server screen and the
// toast carry their own Retry, so nothing retries on its own.
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: Number.POSITIVE_INFINITY, gcTime: 86_400_000, retry: false },
		mutations: { retry: false },
	},
});
