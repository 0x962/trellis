import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { TimelineListOutput } from "@trellis/api";

type Pages = InfiniteData<TimelineListOutput>;

// Rewrites the items of every cached timeline page. A page keeps its
// cursor; only its rows change.
export const updateTimeline = (
	queryClient: QueryClient,
	key: QueryKey,
	change: (items: TimelineListOutput["items"]) => TimelineListOutput["items"],
) => {
	queryClient.setQueryData<Pages>(key, (data) =>
		data === undefined ? data : { ...data, pages: data.pages.map((page) => ({ ...page, items: change(page.items) })) },
	);
};

// Puts one item at the head of the newest page.
export const prependTimeline = (queryClient: QueryClient, key: QueryKey, item: TimelineListOutput["items"][number]) => {
	queryClient.setQueryData<Pages>(key, (data) =>
		data === undefined
			? data
			: {
					...data,
					pages: data.pages.map((page, index) => (index === 0 ? { ...page, items: [item, ...page.items] } : page)),
				},
	);
};
