import { QueryClient } from "@tanstack/react-query";

// Every entity the stream patches stays fresh until an event says otherwise,
// so a query never refetches on its own. A day of garbage-collection time
// keeps a query alive long enough to reach the persisted snapshot.
export const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, gcTime: 86_400_000 } },
});
