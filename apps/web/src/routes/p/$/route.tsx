import { ORPCError } from "@orpc/client";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, type ErrorComponentProps, redirect, useNavigate, useParams } from "@tanstack/react-router";
import type { Status } from "@trellis/api";
import { lazy, Suspense } from "react";
import { Board, boardSortLabel } from "../../../features/board";
import {
	epicPageSearch,
	epicUrlSearch,
	isCanonicalEpicSearch,
	keepEpicPageChoices,
} from "../../../features/epics/epicSearch";
import { isCanonicalSearch } from "../../../features/filters/canonical";
import { FilterBar } from "../../../features/filters/FilterBar";
import { parseSearch, stripDefaults, toCountsQuery, type View, viewOf } from "../../../features/filters/grammar";
import { PageListSkeleton } from "../../../features/pages/PageList/components/PageListSkeleton";
import { isCanonicalPageSearch, type PageSearch, parsePageSearch } from "../../../features/pages/PageList/pageSearch";
import { ArchivedBanner } from "../../../features/project-actions";
import { projectSettingsSection } from "../../../features/project-settings";
import { ListFooter } from "../../../features/shell/ListFooter";
import { NewTicketButton } from "../../../features/shell/NewTicketButton";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { PageTitle } from "../../../features/shell/PageTitle";
import { Topbar } from "../../../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../../../features/shell/ViewSwitch";
import { DisplayPopover } from "../../../features/table/DisplayPopover";
import { ListPending } from "../../../features/table/ListPending";
import { TicketTable } from "../../../features/table/TicketTable";
import { type AppContext, useApp } from "../../../lib/appContext";
import { parseProjectSplat, projectHref } from "../../../lib/projectUrl";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { useUiStore } from "../../../stores/uiStore";
import { ProjectLoadError } from "./components/ProjectLoadError";

// The diffs screen and the epic screens load in their own chunks, so the
// list views never pay for them.
const ProjectDiffsPage = lazy(async () => ({
	default: (await import("../../../features/reviews/ProjectDiffsPage")).ProjectDiffsPage,
}));
const EpicsPage = lazy(async () => ({
	default: (await import("../../../features/epics/EpicsPage")).EpicsPage,
}));
const EpicPage = lazy(async () => ({
	default: (await import("../../../features/epics/EpicPage")).EpicPage,
}));
const PageList = lazy(async () => ({
	default: (await import("../../../features/pages/PageList")).PageList,
}));

type ProjectRouteSearch = Partial<View> & PageSearch;

const parseProjectSearch = (raw: Record<string, unknown>): ProjectRouteSearch => ({
	...keepEpicPageChoices(raw, stripDefaults(parseSearch(raw))),
	...parsePageSearch(raw),
});

const ticketSearchOf = ({
	author: _author,
	watcher: _watcher,
	comment: _comment,
	pin: _pin,
	...search
}: ProjectRouteSearch) => search;

const projectOptions = (context: AppContext, ref: string) =>
	context.orpc.projects.get.queryOptions({ input: { project: ref } });

// A negated status goes out as the rest of `statuses`, so every counts
// query of the route takes the project's statuses.
const countsOptions = (context: AppContext, ref: string, search: Partial<View>, statuses: readonly Status[]) =>
	context.orpc.tickets.counts.queryOptions({
		input: { project: ref, ...toCountsQuery(viewOf(search), { statuses }) },
	});

// `/p/CDE` and its reserved view segments share this route. An epic and a
// Page add their slug after `epics` or `pages`. The URL omits the board
// segment because the board is the default project view.
export const Route = createFileRoute("/p/$")({
	// The epic page groups by wave when the URL names no group, and lists
	// all tickets when the URL names no scope. So `group=status` and
	// `scope=self` are choices there, and the validated
	// search keeps them. On every other view `beforeLoad` redirects them away
	// as written defaults.
	validateSearch: parseProjectSearch,
	beforeLoad: ({ location, params, search }) => {
		// The board is the bare path now. An older link that ends in /board
		// still works: it lands on the same view with the segment dropped.
		const splat = params._splat ?? "";
		const withoutBoard = splat.replace(/\/board$/i, "");
		if (withoutBoard !== splat) {
			throw redirect({ to: "/p/$", params: { _splat: withoutBoard }, search, replace: true });
		}
		// A sheet has no URL of its own. The settings URL and the notes URL
		// of a project open the sheet, then redirect to the tickets of that
		// project.
		const { ref, view } = parseProjectSplat(splat);
		const ticketSearch = ticketSearchOf(search);
		if (view === "pages" || view === "page") {
			const pageSearch = parsePageSearch(search);
			if (!isCanonicalPageSearch(location.searchStr, pageSearch)) {
				throw redirect({ to: "/p/$", params: { _splat: splat }, search: pageSearch, replace: true });
			}
			return;
		}
		if (view === "settings" || view === "notes") {
			pageSheetActions.openProjectSettings({ project: ref, section: projectSettingsSection(view, location.hash) });
			throw redirect({ to: "/p/$", params: { _splat: ref }, search: ticketSearch, replace: true });
		}
		if (view === "epic") {
			const phone = window.matchMedia("(max-width: 767px)").matches;
			if (!isCanonicalEpicSearch(location.searchStr, ticketSearch, phone)) {
				const canonical = epicUrlSearch(epicPageSearch(ticketSearch, "", phone), phone);
				throw redirect({ to: "/p/$", params: { _splat: splat }, search: canonical, replace: true });
			}
			return;
		}
		// What a row waits for reads its pull requests, its dependencies and
		// the agent run that works on it, which the epic page alone loads. An
		// old link with `group=waiting` on a board or a table drops the param, so
		// the view takes its own default grouping. `tab` names a tab of the
		// epic page, so a board or a table drops it too.
		const { tab, ...withoutTab } = ticketSearch;
		const { group, ...withoutGroup } = withoutTab;
		const listSearch = group === "waiting" ? withoutGroup : tab !== undefined ? withoutTab : ticketSearch;
		if (listSearch !== ticketSearch || !isCanonicalSearch(location.searchStr, listSearch)) {
			throw redirect({ to: "/p/$", params: { _splat: splat }, search: stripDefaults(listSearch), replace: true });
		}
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context, params, deps }) => {
		const { ref, view } = parseProjectSplat(params._splat ?? "");
		const project = await context.queryClient.ensureQueryData(projectOptions(context, ref));
		if (view === "board" || view === "table") {
			await context.queryClient.ensureQueryData(countsOptions(context, ref, ticketSearchOf(deps), project.statuses));
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
	const routeSearch = Route.useSearch();
	const search = ticketSearchOf(routeSearch);
	const pageSearch = parsePageSearch(routeSearch);
	const navigate = useNavigate();
	const context = useApp();
	const storedDensity = useUiStore((state) => state.density);
	const { ref, view, epic } = parseProjectSplat(_splat);
	const project = useSuspenseQuery(projectOptions(context, ref)).data;
	const full = viewOf(search);
	const routeKey = projectHref(ref);
	// The loader fills this cache entry, so the board footer reads it on the first paint.
	const counts = useQuery({
		...countsOptions(context, ref, search, project.statuses),
		enabled: view === "board" || view === "table",
	}).data;

	if (view === "pages" || view === "page") {
		return (
			<Suspense fallback={<PageListPending />}>
				<PageList
					key={project.id}
					project={project}
					search={pageSearch}
					onSearchChange={(next) => navigate({ to: "/p/$", params: { _splat }, search: next })}
				/>
			</Suspense>
		);
	}

	if (view === "diffs") {
		return (
			<Suspense
				fallback={
					<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-muted">Load diffs…</div>
				}
			>
				<ProjectDiffsPage key={project.id} project={project} />
			</Suspense>
		);
	}
	if (view === "epics" || view === "epic") {
		return (
			<Suspense
				fallback={
					<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-muted">Load epics…</div>
				}
			>
				{view === "epics" ? (
					<EpicsPage key={project.id} project={project} />
				) : (
					<EpicPage
						key={`${project.id}/${epic}`}
						project={project}
						slug={epic!}
						search={search}
						onSearchChange={(next) => navigate({ to: "/p/$", params: { _splat }, search: next })}
					/>
				)}
			</Suspense>
		);
	}

	const setSearch = (next: Partial<View>) => navigate({ to: "/p/$", params: { _splat }, search: stripDefaults(next) });

	const switchView = (next: ListView) =>
		navigate({
			to: "/p/$",
			params: { _splat: `${ref}${next === "table" ? "/table" : ""}` },
			search,
		});

	const archived = project.archivedAt !== null;
	// `beforeLoad` redirects the settings URL and the notes URL of a project
	// to the tickets of that project. The branches above answer the Pages,
	// diffs, and epic views. The view left here is the board or the table.
	const listView: ListView = view === "table" ? "table" : "board";

	// The server refuses every write to an archived project. The disabled
	// fieldset disables every control in the table and the board; the filters
	// only read, so they stay outside it.
	return (
		<>
			<Topbar actions={<NewTicketButton />}>
				<PageTitle title={project.name} />
				<FilterBar
					lead={<ViewSwitch value={listView} onChange={switchView} />}
					project={ref}
					search={search}
					onSearchChange={setSearch}
					statuses={project.statuses}
					actions={
						<DisplayPopover
							routeKey={routeKey}
							showProject={false}
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
					{listView === "board" ? (
						<>
							<div className="flex min-h-0 flex-1 flex-col">
								<Board
									projectRef={ref}
									filters={toCountsQuery(full, { statuses: project.statuses })}
									storageKey={ref}
									onOpenTicket={pageSheetActions.openTicket}
								/>
							</div>
							<ListFooter total={counts?.total} sort={boardSortLabel} />
						</>
					) : (
						<TicketTable project={ref} routeKey={routeKey} search={search} />
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
	if (view === "pages" || view === "page") return <PageListPending />;
	return <ListPending view={view === "board" ? "board" : "table"} />;
}

function PageListPending() {
	return (
		<>
			<Topbar>
				<PageTitle title="Pages" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				<PageListSkeleton />
			</div>
		</>
	);
}

// A splat that names no project.
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
