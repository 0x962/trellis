import { ORPCError } from "@orpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, type ErrorComponentProps, redirect, useNavigate, useParams } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import { isCanonicalSearch } from "../../../features/filters/canonical";
import { FilterBar } from "../../../features/filters/FilterBar";
import { parseSearch, stripDefaults, toCountsQuery, type View, viewOf } from "../../../features/filters/grammar";
import { sortLabel } from "../../../features/filters/labels";
import { Breadcrumb } from "../../../features/shell/Breadcrumb";
import { ListFooter } from "../../../features/shell/ListFooter";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { Topbar } from "../../../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../../../features/shell/ViewSwitch";
import { DisplayPopover } from "../../../features/table/DisplayPopover";
import { TicketTable } from "../../../features/table/TicketTable";
import { type AppContext, useApp } from "../../../lib/appContext";
import { parseProjectSplat, projectHref, projectSlashPath } from "../../../lib/projectPath";
import { useUiStore } from "../../../stores/uiStore";
import { ProjectSettingsView } from "./components/ProjectSettingsView";
import { ScopeChip } from "./components/ScopeChip";

const projectOptions = (context: AppContext, ref: string) =>
	context.orpc.projects.get.queryOptions({ input: { project: ref } });

const countsOptions = (context: AppContext, ref: string, search: Partial<View>) =>
	context.orpc.tickets.counts.queryOptions({ input: { project: ref, ...toCountsQuery(viewOf(search)) } });

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
		const { ref } = parseProjectSplat(params._splat ?? "");
		await Promise.all([
			context.queryClient.ensureQueryData(projectOptions(context, ref)),
			context.queryClient.ensureQueryData(countsOptions(context, ref, deps)),
		]);
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

	if (view === "settings") return <ProjectSettingsView project={project} />;

	const setSearch = (next: Partial<View>) => navigate({ to: "/p/$", params: { _splat }, search: stripDefaults(next) });

	const switchView = (next: ListView) =>
		navigate({
			to: "/p/$",
			params: { _splat: `${projectSlashPath(ref)}${next === "table" ? "" : "/board"}` },
			search,
		});

	const toggleScope = () => setSearch({ ...search, scope: full.scope === "self" ? "subprojects" : "self" });

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
					<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-faint">
						The board opens in a later milestone.
					</div>
					<ListFooter total={undefined} sort={sortLabel(full.sort)} />
				</>
			) : (
				<TicketTable
					project={ref}
					routeKey={routeKey}
					search={search}
					onSearchChange={setSearch}
					onOpenPage={(identifier) => void navigate({ to: "/t/$identifier", params: { identifier } })}
				/>
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
