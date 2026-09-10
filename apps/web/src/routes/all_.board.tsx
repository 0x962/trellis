import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button, toast } from "@trellis/ui";
import { Copy } from "lucide-react";
import { Board } from "../features/board";
import { isCanonicalSearch } from "../features/filters/canonical";
import { toCliCommand } from "../features/filters/cli";
import { FilterBar } from "../features/filters/FilterBar";
import { parseSearch, stripDefaults, toCountsQuery, type View, viewOf } from "../features/filters/grammar";
import { sortLabel } from "../features/filters/labels";
import { ListFooter } from "../features/shell/ListFooter";
import { Topbar } from "../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../features/shell/ViewSwitch";
import type { AppContext } from "../lib/appContext";
import { useApp } from "../lib/appContext";

const countsOptions = (context: AppContext, search: Partial<View>) =>
	context.orpc.tickets.counts.queryOptions({ input: toCountsQuery(viewOf(search)) });

export const Route = createFileRoute("/all_/board")({
	validateSearch: (search: Record<string, unknown>) => stripDefaults(parseSearch(search)),
	beforeLoad: ({ location, search }) => {
		if (!isCanonicalSearch(location.searchStr, search)) {
			throw redirect({ to: "/all/board", search, replace: true });
		}
	},
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(countsOptions(context, deps)),
	component: AllBoardPage,
});

function AllBoardPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const context = useApp();
	const view = viewOf(search);
	const counts = useQuery(countsOptions(context, search)).data;

	const switchView = (next: ListView) => {
		if (next === "table") void navigate({ to: "/all", search });
	};

	const copyCli = async () => {
		await navigator.clipboard.writeText(toCliCommand(view));
		toast("Copied the CLI command");
	};

	const openTicket = (identifier: string) => navigate({ to: "/all/board", search: { ...search, peek: identifier } });

	return (
		<>
			<Topbar actions={<ViewSwitch value="board" onChange={switchView} />}>
				<h1 className="text-md font-semibold text-fg">All tickets</h1>
			</Topbar>
			<FilterBar
				actions={
					<Button variant="quiet" size="sm" icon={<Copy />} onClick={copyCli}>
						Copy as CLI
					</Button>
				}
			/>
			<Board filters={toCountsQuery(view)} storageKey="all" onOpenTicket={openTicket} />
			<ListFooter total={counts?.total} sort={sortLabel(view.sort)} />
		</>
	);
}
