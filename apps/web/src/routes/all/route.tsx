import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { isCanonicalSearch } from "../../features/filters/canonical";
import { FilterBar } from "../../features/filters/FilterBar";
import { parseSearch, stripDefaults, toCountsQuery, type View, viewOf } from "../../features/filters/grammar";
import { Topbar } from "../../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../../features/shell/ViewSwitch";
import { DisplayPopover } from "../../features/table/DisplayPopover";
import { TicketTable } from "../../features/table/TicketTable";
import { TicketPeek } from "../../features/ticket/TicketPeek";
import { useScopeStatuses } from "../../hooks/useScopeStatuses";
import type { AppContext } from "../../lib/appContext";
import { useUiStore } from "../../stores/uiStore";

const countsOptions = (context: AppContext, search: Partial<View>) =>
	context.orpc.tickets.counts.queryOptions({ input: toCountsQuery(viewOf(search)) });

const routeKey = "/all";

// Every ticket across every project. The URL carries the view in the
// shared grammar, with no default written.
export const Route = createFileRoute("/all")({
	validateSearch: (search: Record<string, unknown>) => stripDefaults(parseSearch(search)),
	beforeLoad: ({ location, search }) => {
		if (!isCanonicalSearch(location.searchStr, search)) throw redirect({ to: "/all", search, replace: true });
	},
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(countsOptions(context, deps)),
	component: AllPage,
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
			<Topbar actions={<ViewSwitch value="table" onChange={switchView} />}>
				<h1 className="text-md font-semibold text-fg">All tickets</h1>
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
