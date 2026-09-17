import { ORPCError } from "@orpc/client";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, type ErrorComponentProps, redirect, useNavigate, useParams } from "@tanstack/react-router";
import type { Status } from "@trellis/api";
import { lazy, Suspense } from "react";
import { Board, boardSortLabel } from "../../../features/board";
import { isCanonicalSearch } from "../../../features/filters/canonical";
import { FilterBar } from "../../../features/filters/FilterBar";
import { parseSearch, stripDefaults, toCountsQuery, type View, viewOf } from "../../../features/filters/grammar";
import { ListFooter } from "../../../features/shell/ListFooter";
import { NewTicketButton } from "../../../features/shell/NewTicketButton";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { PageTitle } from "../../../features/shell/PageTitle";
import { ProjectBreadcrumb } from "../../../features/shell/ProjectBreadcrumb";
import { Topbar } from "../../../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../../../features/shell/ViewSwitch";
import { DisplayPopover } from "../../../features/table/DisplayPopover";
import { ListPending } from "../../../features/table/ListPending";
import { TicketTable } from "../../../features/table/TicketTable";
import { type AppContext, useApp } from "../../../lib/appContext";
import { parseProjectSplat, projectHref, projectSlashPath } from "../../../lib/projectPath";
import { useUiStore } from "../../../stores/uiStore";
import { ArchivedBanner } from "./components/ArchivedBanner";
import { ProjectLoadError } from "./components/ProjectLoadError";

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

// `/p/CDE`, `/p/CDE/board`, `/p/CDE/web/auth`, `/p/CDE/settings`, and
// `/p/CDE/notes`. The splat is `[key, ...slugs, view?]`. The URL keeps
// slashes, and the API ref joins with dots. The URL omits the default view.
export const Route = createFileRoute("/p/$")({
	validateSearch: (search: Record<string, unknown>) => stripDefaults(parseSearch(search)),
	beforeLoad: ({ location, params, search }) => {
		// The board is the bare path now. An older link that ends in /board
		// still works: it lands on the same view with the segment dropped.
		const splat = params._splat ?? "";
		const withoutBoard = splat.replace(/\/board$/i, "");
		if (withoutBoard !== splat) {
			throw redirect({ to: "/p/$", params: { _splat: withoutBoard }, search, replace: true });
		}
		if (!isCanonicalSearch(location.searchStr, search)) {
			throw redirect({ to: "/p/$", params: { _splat: splat }, search, replace: true });
		}
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context, params, deps }) => {
		const { ref, view } = parseProjectSplat(params._splat ?? "");
		const project = await context.queryClient.ensureQueryData(projectOptions(context, ref));
		if (view === "manager" || view === "notes") {
			return;
		}
		if (view !== "settings") {
			await context.queryClient.ensureQueryData(countsOptions(context, ref, deps, project.statuses));
		}
	},
	component: ProjectPage,
	// A load over 300 ms shows the shape of the project's view for at least
	// 200 ms, so a fast load never flashes it.
	pendingMs: 300,
	pendingMinMs: 200,
	pendingComponent: ProjectPending,
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

	if (view === "settings" || view === "manager" || view === "notes") {
		return (
			<Suspense
				fallback={
					<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-muted">
						{view === "notes" ? "Load notes…" : "Load settings…"}
					</div>
				}
			>
				{view === "manager" ? (
					<ProjectSettingsPage project={project} />
				) : (
					<ProjectSettingsPage project={project} section={view === "notes" ? "notes" : undefined} />
				)}
			</Suspense>
		);
	}

	const setSearch = (next: Partial<View>) => navigate({ to: "/p/$", params: { _splat }, search: stripDefaults(next) });

	const switchView = (next: ListView) =>
		navigate({
			to: "/p/$",
			params: { _splat: `${projectSlashPath(ref)}${next === "table" ? "/table" : ""}` },
			search,
		});

	const openTicket = (identifier: string) => navigate({ to: "/t/$identifier", params: { identifier } });

	const archived = project.archivedAt !== null;

	// The server refuses every write to an archived project. The disabled
	// fieldset disables every control in the table and the board; the filters
	// only read, so they stay outside it.
	return (
		<>
			<Topbar actions={<NewTicketButton />}>
				<PageTitle
					parent={project.ancestors.length > 0 ? <ProjectBreadcrumb project={project.ancestors.at(-1)!} /> : undefined}
					title={project.name}
				/>
				<FilterBar
					lead={<ViewSwitch value={view} onChange={switchView} />}
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
				/>
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{archived && <ArchivedBanner project={project} />}
				<fieldset disabled={archived} className="contents">
					{view === "board" ? (
						<>
							<div className="flex min-h-0 flex-1 flex-col">
								<Board
									projectRef={ref}
									filters={toCountsQuery(full, { statuses: project.statuses })}
									storageKey={ref}
									onOpenTicket={openTicket}
								/>
							</div>
							<ListFooter total={counts?.total} sort={boardSortLabel} />
						</>
					) : (
						<TicketTable
							project={ref}
							routeKey={routeKey}
							search={search}
							onOpenPage={(identifier) => void navigate({ to: "/t/$identifier", params: { identifier } })}
						/>
					)}
				</fieldset>
			</div>
		</>
	);
}

// The table or the board skeleton, from the view the splat names.
function ProjectPending() {
	const params = useParams({ strict: false });
	const { view } = parseProjectSplat(params._splat ?? "");
	return <ListPending view={view === "board" ? "board" : "table"} />;
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
					<PageTitle title={ref} />
				</Topbar>
				<NotFoundState ref={ref} />
			</>
		);
	}
	return <ProjectLoadError error={error} />;
}
