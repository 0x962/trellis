import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ListQueryInput, Status, StatusCategory, TicketSummary } from "@trellis/api";
import { useEffect, useMemo } from "react";
import { useScopeStatuses, useScopeStatusesAll } from "../../../../hooks/useScopeStatuses";
import { useApp } from "../../../../lib/appContext";
import { toCountsQuery, type View } from "../../../filters/grammar";
import {
	activeInput,
	closedInput,
	closedSlugs,
	hasInlineClosed,
	hasStatusFilter,
	inlineClosedInput,
	rowCap,
} from "../../utils/listQuery";

export type ClosedCategory = "done" | "canceled";

export type ClosedGroupData = {
	rows: TicketSummary[];
	hasMore: boolean;
	loadMore: () => void;
	loading: boolean;
	// The server's count for the category, from `tickets.counts`.
	count: number;
};

export type TableDataOptions = {
	// The project ref of the route, or undefined for a table over every project.
	project?: string;
	view: View;
	// The closed categories whose groups are open. Each loads on its own.
	expanded: readonly ClosedCategory[];
};

export type TableData = {
	// The active rows, every page so far, in server order.
	rows: TicketSummary[];
	// True when the active pass stopped at the cap with more on the server.
	capped: boolean;
	// True when the active pass reached its final page.
	allActiveLoaded: boolean;
	// True until the first page arrives.
	loading: boolean;
	// The failure of the active pass, or null. It stays set while a retry
	// is in flight and clears when a page arrives.
	error: Error | null;
	// Runs the active pass again after a failure.
	retry: () => void;
	// The Done and Canceled groups, or null while a status filter names
	// the groups the table shows.
	closed: Record<ClosedCategory, ClosedGroupData> | null;
	// The Done and Canceled rows that the groups of the view hold beside the
	// active rows, or null when the view keeps them out of its groups. See
	// `hasInlineClosed`.
	inlineClosed: TicketSummary[] | null;
	statuses: Status[];
	// The total under the same filters, or undefined until it arrives.
	total: number | undefined;
};

const noRows: TicketSummary[] = [];

const withCursor = (input: ListQueryInput, cursor: string | undefined): ListQueryInput =>
	cursor === undefined ? input : { ...input, cursor };

// The two-tier load. The active pass reads the open categories in 200-row
// pages until the cursor runs out or the cap is reached. A closed group
// reads its own pages of 50 once its header expands. Every page lives
// under `tickets.list` keys, so a live patch and a mutation response reach
// every row. Under the wave grouping of one epic a third pass reads
// every Done and Canceled row in 200-row pages, up to the cap, and the two
// closed groups stay off.
export const useTableData = ({ project, view, expanded }: TableDataOptions): TableData => {
	const { orpc, queryClient } = useApp();
	const statuses = useScopeStatuses(project);
	// The grouping reads the folded list, which names one root's status per
	// slug. A count over a category reads every root's statuses, so a ticket
	// another root closed lands in the group count and in the footer.
	const allStatuses = useScopeStatusesAll(project);
	const filtered = hasStatusFilter(view);
	// A negated status set is the rest of the scope's statuses, so the pass
	// waits for them.
	const ready = !(view.not?.includes("status") && statuses.length === 0);

	const activeOptions = orpc.tickets.list.infiniteOptions({
		input: (cursor: string | undefined) => withCursor(activeInput(project, view, statuses), cursor),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});
	const active = useInfiniteQuery({
		...activeOptions,
		enabled: ready,
		refetchOnWindowFocus: "always",
	});
	const rows = useMemo(() => active.data?.pages.flatMap((page) => page.items) ?? noRows, [active.data]);
	const capped = rows.length >= rowCap && active.hasNextPage;

	useEffect(() => {
		if (!active.hasNextPage || active.isFetchingNextPage || rows.length >= rowCap) return;
		void active.fetchNextPage();
	}, [active.hasNextPage, active.isFetchingNextPage, active.fetchNextPage, rows.length]);

	// An empty status list in the query means every status, so the pass waits
	// for the closed statuses of the scope.
	const inline =
		hasInlineClosed(view) && closedSlugs(statuses, "done").length + closedSlugs(statuses, "canceled").length > 0;
	const inlinePass = useInfiniteQuery({
		...orpc.tickets.list.infiniteOptions({
			input: (cursor: string | undefined) => withCursor(inlineClosedInput(project, view, statuses), cursor),
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
		enabled: inline,
		refetchOnWindowFocus: "always",
	});
	const inlineRows = useMemo(() => inlinePass.data?.pages.flatMap((page) => page.items) ?? noRows, [inlinePass.data]);

	useEffect(() => {
		if (!inline || !inlinePass.hasNextPage || inlinePass.isFetchingNextPage || inlineRows.length >= rowCap) return;
		void inlinePass.fetchNextPage();
	}, [inline, inlinePass.hasNextPage, inlinePass.isFetchingNextPage, inlinePass.fetchNextPage, inlineRows.length]);

	const counts = useQuery({
		...orpc.tickets.counts.queryOptions({
			input:
				project === undefined ? toCountsQuery(view, { statuses }) : { project, ...toCountsQuery(view, { statuses }) },
		}),
		refetchOnWindowFocus: "always",
	});

	const countOf = (category: StatusCategory) => {
		const ids = new Set(allStatuses.filter((status) => status.category === category).map((status) => status.id));
		return (counts.data?.byStatus ?? [])
			.filter((entry) => ids.has(entry.statusId))
			.reduce((sum, entry) => sum + entry.count, 0);
	};

	const closedGroup = (category: ClosedCategory): ClosedGroupData => {
		const enabled = !filtered && !inline && expanded.includes(category) && closedSlugs(statuses, category).length > 0;
		// biome-ignore lint/correctness/useHookAtTopLevel: the two categories call this in a fixed order on every render.
		const query = useInfiniteQuery({
			...orpc.tickets.list.infiniteOptions({
				input: (cursor: string | undefined) => withCursor(closedInput(project, view, statuses, category), cursor),
				initialPageParam: undefined as string | undefined,
				getNextPageParam: (last) => last.nextCursor ?? undefined,
			}),
			enabled,
			refetchOnWindowFocus: "always",
		});
		return {
			rows: enabled ? (query.data?.pages.flatMap((page) => page.items) ?? noRows) : noRows,
			hasMore: enabled && query.hasNextPage,
			loadMore: () => void query.fetchNextPage(),
			loading: query.isFetching,
			count: countOf(category),
		};
	};
	const done = closedGroup("done");
	const canceled = closedGroup("canceled");

	return {
		rows,
		capped,
		allActiveLoaded: active.data !== undefined && !active.hasNextPage,
		// The inline closed rows land with the first active page, so a group
		// never gains its done rows on screen.
		loading: active.isPending || (inline && inlinePass.isPending),
		error: active.data === undefined ? (active.failureReason ?? active.error) : null,
		retry: () => void queryClient.resetQueries({ queryKey: activeOptions.queryKey, exact: true }),
		closed: filtered ? null : { done, canceled },
		inlineClosed: inline ? inlineRows : null,
		statuses,
		total: counts.data?.total,
	};
};
