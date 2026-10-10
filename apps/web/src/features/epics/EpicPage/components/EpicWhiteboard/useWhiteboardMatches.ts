import { useInfiniteQuery } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { useEffect } from "react";
import { useApp } from "../../../../../lib/appContext";
import { toListQuery, type View, viewOf } from "../../../../filters/grammar";
import { hasFilters } from "../../../../filters/labels";

export function useWhiteboardMatches(project: Project, epic: string, search: Partial<View>) {
	const { orpc } = useApp();
	const filtered = hasFilters(search) || search.closed === "hide";
	const view = viewOf({ ...search, epic, project: project.key });
	const query = useInfiniteQuery({
		...orpc.tickets.list.infiniteOptions({
			input: (cursor: string | undefined) => ({
				...toListQuery(view, { statuses: project.statuses }),
				cursor,
				limit: 200,
			}),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
		enabled: filtered,
	});
	useEffect(() => {
		if (query.hasNextPage && !query.isFetchingNextPage && !query.isError) void query.fetchNextPage();
	}, [query.hasNextPage, query.isFetchingNextPage, query.isError, query.fetchNextPage]);
	const matches = new Set(
		query.data?.pages
			.flatMap((page) => page.items)
			.filter(
				(ticket) =>
					search.closed !== "hide" || (ticket.status.category !== "done" && ticket.status.category !== "canceled"),
			)
			.map((ticket) => ticket.id),
	);
	return { filtered, matches: filtered && query.isSuccess && !query.hasNextPage ? matches : null, error: query.error };
}
