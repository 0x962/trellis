import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { TimelineItem, TimelineListOutput } from "@trellis/api";
import { getQueries } from "../../lib/orpc";

// The timeline of one ticket, newest first, one page per cursor. The key is
// the oRPC infinite key of `timeline.list` with the ticket as input. The
// event applier matches it by path and ticket, and a refetch reads every
// loaded page again from the first one, so no item falls between two pages.
export const timelineOptions = (identifier: string) =>
	getQueries().timeline.list.infiniteOptions({
		input: (before: string | undefined) => ({ ticket: identifier, before }),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});

// Puts one item at the head of the newest page. The older pages keep their
// items and their cursors.
export const prependTimeline = (queryClient: QueryClient, identifier: string, item: TimelineItem) => {
	queryClient.setQueryData<InfiniteData<TimelineListOutput>>(timelineOptions(identifier).queryKey, (data) =>
		data === undefined
			? data
			: {
					...data,
					pages: data.pages.map((page, index) => (index === 0 ? { ...page, items: [item, ...page.items] } : page)),
				},
	);
};
