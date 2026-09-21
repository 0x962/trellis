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
