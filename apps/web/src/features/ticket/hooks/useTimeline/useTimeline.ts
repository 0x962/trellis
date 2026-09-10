import { useInfiniteQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";
import type { Orpc } from "../../../../lib/orpc";

// The infinite query of one ticket's timeline, newest first, page by page.
export const timelineOptions = (orpc: Orpc, identifier: string) =>
	orpc.timeline.list.infiniteOptions({
		input: (before: string | undefined) => ({ ticket: identifier, before }),
		initialPageParam: undefined,
		getNextPageParam: (page) => page.nextCursor ?? undefined,
	});

// The timeline pages of one ticket, as `timeline.list` returns them. The
// rail reads the creator from the same query, so the page fetches the
// stream once.
export const useTimeline = (identifier: string) => {
	const { orpc } = useApp();
	return useInfiniteQuery(timelineOptions(orpc, identifier));
};
