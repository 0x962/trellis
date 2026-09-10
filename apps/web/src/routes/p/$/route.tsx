import { ORPCError } from "@orpc/client";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, type ErrorComponentProps, redirect, useNavigate, useParams } from "@tanstack/react-router";
import type { Status } from "@trellis/api";
import { EmptyState } from "@trellis/ui";
import { lazy, Suspense, useEffect } from "react";
import { Board } from "../../../features/board";
import { isCanonicalSearch } from "../../../features/filters/canonical";
import { FilterBar } from "../../../features/filters/FilterBar";
import {
	parseSearch,
	serializeSearch,
	stripDefaults,
	toCountsQuery,
	type View,
	viewOf,
} from "../../../features/filters/grammar";
import { sortLabel } from "../../../features/filters/labels";
import { Breadcrumb } from "../../../features/shell/Breadcrumb";
import { ListFooter } from "../../../features/shell/ListFooter";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { Topbar } from "../../../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../../../features/shell/ViewSwitch";
import { DisplayPopover } from "../../../features/table/DisplayPopover";
import { TicketTable } from "../../../features/table/TicketTable";
import { TicketPeek } from "../../../features/ticket/TicketPeek";
import { type AppContext, useApp } from "../../../lib/appContext";
import { rememberList } from "../../../lib/lastList";
import { parseProjectSplat, projectHref, projectSlashPath } from "../../../lib/projectPath";
import { useUiStore } from "../../../stores/uiStore";
import { ScopeChip } from "./components/ScopeChip";

// The settings screen loads in its own chunk, so the list views never pay for it.
const ProjectSettingsPage = lazy(async () => ({
	default: (await import("./components/ProjectSettingsPage")).ProjectSettingsPage,
}));

const projectOptions = (context: AppContext, ref: string) =>
	context.orpc.projects.get.queryOptions({ input: { project: ref } });

// A negated status goes out as the rest of `statuses`, so every counts
// query of the route takes the project's statuses.
const countsOptions = (context: AppContext, ref: string, search: Partial<View>, statuses: readonly Status[]) =>
	context.orpc.tickets.counts.queryOptions({
		input: { project: ref, ...toCountsQuery(viewOf(search), { statuses }) },
	});

// `/p/CDE`, `/p/CDE/board`, `/p/CDE/web/auth`, `/p/CDE/settings`. The splat
// is `[key, ...slugs, view?]`; the URL keeps slashes and the API ref joins
// with dots. The URL carries the view state with no default written.
export const Route = createFileRoute("/p/$")({
	validateSearch: (search: Record<string, unknown>) => stripDefaults(parseSearch(search)),
	beforeLoad: ({ location, params, search }) => {
		if (!isCanonicalSearch(location.searchStr, search)) {
			throw redirect({ to: "/p/$", params: { _splat: params._splat ?? "" }, search, replace: true });
		}
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context, params, deps }) => {
		const { ref, view } = parseProjectSplat(params._splat ?? "");
		const project = await context.queryClient.ensureQueryData(projectOptions(context, ref));
		if (view !== "settings") {
			await context.queryClient.ensureQueryData(countsOptions(context, ref, deps, project.statuses));
		}
	},
	component: ProjectPage,
	errorComponent: ProjectError,
	notFoundComponent: ProjectMissing,
});

function ProjectPage() {
	const _splat = Route.useParams()._splat ?? "";
	const search = Route.useSearch();
	const navigate = useNavigate();
	const context = useApp();
	const storedDensity = useUiStore((state) => state.density);
	const { ref, view } = parseProjectSplat(_splat);
	const project = useSuspenseQuery(projectOptions(context, ref)).data;
	const full = viewOf(search);
	const routeKey = projectHref(ref);
	// The loader fills this cache entry, so the board footer reads it on the first paint.
	const counts = useQuery(countsOptions(context, ref, search, project.statuses)).data;
	// The list URL without the peek, so the full ticket page can link back
	// to the list it came from.
	const searchText = serializeSearch({ ...search, peek: undefined });
	const listHref = `/p/${_splat}${searchText === "" ? "" : `?${searchText}`}`;

	useEffect(() => rememberList(listHref), [listHref]);

	if (view === "settings") {
		return (
			<Suspense
				fallback={
					<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-muted">Loading settings…</div>
				}
			>
				<ProjectSettingsPage project={project} />
			</Suspense>
		);
	}

	const setSearch = (next: Partial<View>) => navigate({ to: "/p/$", params: { _splat }, search: stripDefaults(next) });

	const switchView = (next: ListView) =>
		navigate({
			to: "/p/$",
			params: { _splat: `${projectSlashPath(ref)}${next === "table" ? "" : "/board"}` },
			search,
		});

	const toggleScope = () => setSearch({ ...search, scope: full.scope === "self" ? "subprojects" : "self" });

	const openTicket = (identifier: string) =>
		navigate({ to: "/p/$", params: { _splat }, search: { ...search, peek: identifier } });

	return (
		<>
			<Topbar actions={<ViewSwitch value={view} onChange={switchView} />}>
				<Breadcrumb path={ref} current={project.name} />
			</Topbar>
			<FilterBar
				project={ref}
				search={search}
				onSearchChange={setSearch}
				statuses={project.statuses}
				actions={
					<DisplayPopover
						routeKey={routeKey}
						showProject={project.children.length > 0 && full.scope !== "self"}
						search={search}
						onSearchChange={setSearch}
						density={search.density ?? storedDensity}
						group={full.group}
						sort={full.sort}
					/>
				}
			>
				<ScopeChip path={ref} scope={full.scope} onToggle={toggleScope} />
			</FilterBar>
			{view === "board" ? (
				<>
					<div className="flex min-h-0 flex-1 flex-col">
						<Board projectRef={ref} filters={toCountsQuery(full, { statuses: project.statuses })} storageKey={ref} onOpenTicket={openTicket}>
							<TicketPeek />
						</Board>
					</div>
					<ListFooter total={counts?.total} sort={sortLabel(full.sort)} />
				</>
			) : (
				<TicketTable
					project={ref}
					routeKey={routeKey}
					search={search}
					onSearchChange={setSearch}
					onOpenPage={(identifier) => void navigate({ to: "/t/$identifier", params: { identifier } })}
				>
					<TicketPeek />
				</TicketTable>
			)}
		</>
	);
}

// A splat that is not a project path.
function ProjectMissing() {
	const params = useParams({ strict: false });
	return <NotFoundState ref={params._splat ?? ""} />;
}

// The API said no. NOT_FOUND names the ref; anything else shows its message.
function ProjectError({ error }: ErrorComponentProps) {
	if (error instanceof ORPCError && error.code === "NOT_FOUND") {
		const { ref } = error.data as { ref: string };
		return (
			<>
				<Topbar>
					<h1 className="text-md font-semibold text-fg">{ref}</h1>
				</Topbar>
				<NotFoundState ref={ref} />
			</>
		);
	}
	return (
		<EmptyState
			title="Something went wrong"
			description={error instanceof Error ? error.message : String(error)}
			className="flex-1 justify-center"
		/>
	);
}
