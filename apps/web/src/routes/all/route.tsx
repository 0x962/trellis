import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { Button, toast } from "@trellis/ui";
import { Copy } from "lucide-react";
import { isCanonicalSearch } from "../../features/filters/canonical";
import { toCli } from "../../features/filters/cli";
import { FilterBar } from "../../features/filters/FilterBar";
import { parseSearch, stripDefaults, toCountsQuery, toListQuery, type View, viewOf } from "../../features/filters/grammar";
import { sortLabel } from "../../features/filters/labels";
import { ListFooter } from "../../features/shell/ListFooter";
import { Topbar } from "../../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../../features/shell/ViewSwitch";
import type { AppContext } from "../../lib/appContext";
import { useApp } from "../../lib/appContext";

const countsOptions = (context: AppContext, search: Partial<View>) =>
	context.orpc.tickets.counts.queryOptions({ input: toCountsQuery(viewOf(search)) });

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
	const context = useApp();
	const view = viewOf(search);
	const counts = useQuery(countsOptions(context, search)).data;

	const switchView = (next: ListView) => {
		if (next === "board") void router.navigate({ href: "/all/board" });
		else void navigate({ to: "/all", search });
	};

	const copyCli = async () => {
		await navigator.clipboard.writeText(toCli(toListQuery(view)));
		toast("Copied the CLI command");
	};

	return (
		<>
			<Topbar actions={<ViewSwitch value="table" onChange={switchView} />}>
				<h1 className="text-md font-semibold text-fg">All tickets</h1>
			</Topbar>
			<FilterBar
				actions={
					<Button variant="quiet" size="sm" icon={<Copy />} onClick={copyCli}>
						Copy as CLI
					</Button>
				}
			/>
			<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-faint">
				{counts !== undefined && `${counts.total} tickets across every project`}
			</div>
			<ListFooter total={counts?.total} sort={sortLabel(view.sort)} />
		</>
	);
}
