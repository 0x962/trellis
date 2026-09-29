import type { Orpc } from "../../../lib/orpc";

export const searchOptions = (orpc: Orpc, q: string, rankProject?: string) =>
	orpc.search.query.infiniteOptions({
		input: (offset: number) => ({ q, rankProject, offset, limit: 20 }),
		initialPageParam: 0,
		getNextPageParam: (page) => page.nextOffset ?? undefined,
	});
