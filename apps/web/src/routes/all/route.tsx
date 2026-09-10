import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import type { Status } from "@trellis/api";
import { isCanonicalSearch } from "../../features/filters/canonical";
import { FilterBar } from "../../features/filters/FilterBar";
import { parseSearch, stripDefaults, toCountsQuery, type View, viewOf } from "../../features/filters/grammar";
import { NewTicketButton } from "../../features/shell/NewTicketButton";
import { Topbar } from "../../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../../features/shell/ViewSwitch";
import { DisplayPopover } from "../../features/table/DisplayPopover";
import { ListPending } from "../../features/table/ListPending";
import { TicketTable } from "../../features/table/TicketTable";
import { TicketPeek } from "../../features/ticket/TicketPeek";
import { useScopeStatuses } from "../../hooks/useScopeStatuses";
import type { AppContext } from "../../lib/appContext";
import { loadScopeStatuses } from "../../lib/scopeStatuses";
import { useUiStore } from "../../stores/uiStore";

// A negated status goes out as the rest of `statuses`. The table's counts
// query takes the same statuses, so the loader fills the entry it reads.
const countsOptions = (context: AppContext, search: Partial<View>, statuses: readonly Status[]) =>
	context.orpc.tickets.counts.queryOptions({ input: toCountsQuery(viewOf(search), { statuses }) });

const routeKey = "/all";

// Every ticket across every project. The URL carries the view in the
// shared grammar, with no default written.
export const Route = createFileRoute("/all")({
	validateSearch: (search: Record<string, unknown>) => stripDefaults(parseSearch(search)),
	beforeLoad: ({ location, search }) => {
		if (!isCanonicalSearch(location.searchStr, search)) throw redirect({ to: "/all", search, replace: true });
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps }) => {
		const statuses = await loadScopeStatuses(context);
		await context.queryClient.ensureQueryData(countsOptions(context, deps, statuses));
	},
	component: AllPage,
	// A load over 300 ms shows the table's shape for at least 200 ms, so a
	// fast load never flashes it.
	pendingMs: 300,
	pendingMinMs: 200,
	pendingComponent: () => <ListPending view="table" title="All tickets" />,
});

function AllPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const router = useRouter();
	const storedDensity = useUiStore((state) => state.density);
	const statuses = useScopeStatuses();
	const full = viewOf(search);

	const setSearch = (next: Partial<View>) => navigate({ to: "/all", search: stripDefaults(next) });

	const switchView = (next: ListView) => {
		if (next === "board") void router.navigate({ href: "/all/board" });
		else void navigate({ to: "/all", search });
	};

	return (
		<>
			<Topbar
				actions={
					<>
						<ViewSwitch value="table" onChange={switchView} />
						<NewTicketButton />
					</>
				}
			>
				<h1 className="text-lg font-semibold text-fg">All tickets</h1>
			</Topbar>
			<FilterBar
				search={search}
				onSearchChange={setSearch}
				statuses={statuses}
				actions={
					<DisplayPopover
						routeKey={routeKey}
						showProject
						search={search}
						onSearchChange={setSearch}
						density={search.density ?? storedDensity}
						group={full.group}
						sort={full.sort}
					/>
				}
			/>
			<TicketTable
				routeKey={routeKey}
				search={search}
				onSearchChange={setSearch}
				onOpenPage={(identifier) => void navigate({ to: "/t/$identifier", params: { identifier } })}
			>
				<TicketPeek />
			</TicketTable>
		</>
	);
}
