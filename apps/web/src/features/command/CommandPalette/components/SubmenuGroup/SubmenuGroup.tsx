import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button, Command, FailureState, Spinner } from "@trellis/ui";
import { useCommandState } from "cmdk";
import { useEffect } from "react";
import { useApp } from "../../../../../lib/appContext";
import type { RowDeps, Submenu } from "../../../rows";
import { drawRows } from "../../../utils/drawRows";
import { submenuHeadings, submenuRows } from "../../../utils/submenuRows";

export type SubmenuGroupProps = {
	submenu: Submenu;
	deps: RowDeps;
};

function FilteredEmpty({ hasRows }: { hasRows: boolean }) {
	const filteredCount = useCommandState((state) => state.filtered.count);
	if (!hasRows || filteredCount > 0) return null;
	return <Command.Empty>No options match your search</Command.Empty>;
}

// The values one submenu offers. The five lists it can need come from the
// server: the statuses of a project, the tickets a parent is picked from,
// the labels of a project, the epics of a project, and the
// waves of an epic. A query that is off never sends its placeholder
// input.
export function SubmenuGroup({ submenu, deps }: SubmenuGroupProps) {
	const { orpc } = useApp();
	const project =
		submenu.kind === "status" || submenu.kind === "parent" || submenu.kind === "labels" || submenu.kind === "epic"
			? submenu.project
			: "";
	const statuses = useQuery({
		...orpc.statuses.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "status",
	});
	const tickets = useInfiniteQuery({
		...orpc.tickets.list.infiniteOptions({
			input: (cursor: string | undefined) =>
				cursor === undefined ? { project, limit: 200 } : { project, limit: 200, cursor },
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (last) => last.nextCursor ?? undefined,
		}),
		enabled: submenu.kind === "parent",
	});
	const labels = useQuery({
		...orpc.labels.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "labels",
	});
	const epics = useQuery({
		...orpc.epics.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "epic",
	});
	const epic = useQuery({
		...orpc.epics.get.queryOptions({ input: { epic: submenu.kind === "wave" ? submenu.epic : "" } }),
		enabled: submenu.kind === "wave",
	});
	const ticketPageCount = tickets.data?.pages.length ?? 0;
	useEffect(() => {
		if (submenu.kind !== "parent" || ticketPageCount === 0 || !tickets.hasNextPage || tickets.isFetchingNextPage) {
			return;
		}
		void tickets.fetchNextPage();
	}, [submenu.kind, ticketPageCount, tickets.fetchNextPage, tickets.hasNextPage, tickets.isFetchingNextPage]);
	const rows = submenuRows(submenu, deps, {
		statuses: statuses.data?.statuses ?? [],
		tickets: tickets.data?.pages.flatMap((page) => page.items) ?? [],
		labels: labels.data?.labels ?? [],
		labelGroups: labels.data?.groups ?? [],
		epics: epics.data ?? [],
		waves: epic.data?.waves ?? [],
	});
	const loading =
		(submenu.kind === "status" && statuses.isPending) ||
		(submenu.kind === "parent" && (tickets.isPending || tickets.hasNextPage || tickets.isFetchingNextPage)) ||
		(submenu.kind === "labels" && labels.isPending) ||
		(submenu.kind === "epic" && epics.isPending) ||
		(submenu.kind === "wave" && epic.isPending);
	const error =
		submenu.kind === "status"
			? statuses.error
			: submenu.kind === "parent"
				? tickets.error
				: submenu.kind === "labels"
					? labels.error
					: submenu.kind === "epic"
						? epics.error
						: submenu.kind === "wave"
							? epic.error
							: null;
	const retry = () => {
		if (submenu.kind === "status") void statuses.refetch();
		if (submenu.kind === "parent") void tickets.refetch();
		if (submenu.kind === "labels") void labels.refetch();
		if (submenu.kind === "epic") void epics.refetch();
		if (submenu.kind === "wave") void epic.refetch();
	};

	if (loading) {
		return (
			<div
				aria-live="polite"
				aria-busy="true"
				className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 py-6 text-sm text-fg-muted"
			>
				<Spinner />
				Loading options
			</div>
		);
	}

	if (error !== null) {
		return (
			<FailureState
				variant="section"
				title="Options did not load"
				detail={error.message}
				action={<Button onClick={retry}>Retry</Button>}
			/>
		);
	}

	return (
		<Command.List className="min-h-0 flex-1 max-h-none">
			{rows.length === 0 ? (
				<Command.Empty>No options available</Command.Empty>
			) : (
				<Command.Group heading={submenuHeadings[submenu.kind]}>{drawRows(rows)}</Command.Group>
			)}
			<FilteredEmpty hasRows={rows.length > 0} />
		</Command.List>
	);
}
