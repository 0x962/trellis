import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { Status } from "@trellis/api";
import { Board, boardSort } from "../features/board";
import { isCanonicalSearch } from "../features/filters/canonical";
import { FilterBar } from "../features/filters/FilterBar";
import { parseSearch, stripDefaults, toCountsQuery, type View, viewOf } from "../features/filters/grammar";
import { sortLabel } from "../features/filters/labels";
import { ListFooter } from "../features/shell/ListFooter";
import { NewTicketButton } from "../features/shell/NewTicketButton";
import { Topbar } from "../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../features/shell/ViewSwitch";
import { ListPending } from "../features/table/ListPending";
import { TicketPeek } from "../features/ticket/TicketPeek";
import { useScopeStatuses } from "../hooks/useScopeStatuses";
import type { AppContext } from "../lib/appContext";
import { useApp } from "../lib/appContext";
import { loadScopeStatuses } from "../lib/scopeStatuses";

// A negated status goes out as the rest of `statuses`. The page reads the
// same statuses, so the loader fills the entry the footer reads.
const countsOptions = (context: AppContext, search: Partial<View>, statuses: readonly Status[]) =>
	context.orpc.tickets.counts.queryOptions({ input: toCountsQuery(viewOf(search), { statuses }) });

// Every ticket across every project as a board with one column per status
// category. The URL carries the view in the shared grammar, with no
// default written.
export const Route = createFileRoute("/all_/board")({
	validateSearch: (search: Record<string, unknown>) => stripDefaults(parseSearch(search)),
	beforeLoad: ({ location, search }) => {
		if (!isCanonicalSearch(location.searchStr, search)) {
			throw redirect({ to: "/all/board", search, replace: true });
		}
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const statuses = await loadScopeStatuses(context);
		await context.queryClient.ensureQueryData(countsOptions(context, deps, statuses));
	},
	component: AllBoardPage,
	// A load over 300 ms shows the board's shape for at least 200 ms, so a
	// fast load never flashes it.
	pendingMs: 300,
	pendingMinMs: 200,
	pendingComponent: () => <ListPending view="board" title="All tickets" />,
});

function AllBoardPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const context = useApp();
	const statuses = useScopeStatuses();
	const view = viewOf(search);
	const counts = useQuery(countsOptions(context, search, statuses)).data;

	const setSearch = (next: Partial<View>) => navigate({ to: "/all/board", search: stripDefaults(next) });

	const switchView = (next: ListView) => {
		if (next === "table") void navigate({ to: "/all", search });
	};

	const openTicket = (identifier: string) => navigate({ to: "/all/board", search: { ...search, peek: identifier } });

	return (
		<>
			<Topbar
				actions={
					<>
						<ViewSwitch value="board" onChange={switchView} />
						<NewTicketButton />
					</>
				}
			>
				<h1 className="text-lg font-semibold text-fg">All tickets</h1>
			</Topbar>
			<FilterBar search={search} onSearchChange={setSearch} statuses={statuses} />
			<Board filters={toCountsQuery(view, { statuses })} storageKey="all" onOpenTicket={openTicket}>
				<TicketPeek />
			</Board>
			<ListFooter total={counts?.total} sort={sortLabel(boardSort)} />
		</>
	);
}
