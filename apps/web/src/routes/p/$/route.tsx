import { ORPCError } from "@orpc/client";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	type ErrorComponentProps,
	Link,
	redirect,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { Button, EmptyState, toast } from "@trellis/ui";
import { Copy } from "lucide-react";
import { isCanonicalSearch } from "../../../features/filters/canonical";
import { toCli } from "../../../features/filters/cli";
import { FilterBar } from "../../../features/filters/FilterBar";
import {
	parseSearch,
	stripDefaults,
	toCountsQuery,
	toListQuery,
	type View,
	viewOf,
} from "../../../features/filters/grammar";
import { hasFilters, sortLabel } from "../../../features/filters/labels";
import { Breadcrumb } from "../../../features/shell/Breadcrumb";
import { ListFooter } from "../../../features/shell/ListFooter";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { Topbar } from "../../../features/shell/Topbar";
import { type ListView, ViewSwitch } from "../../../features/shell/ViewSwitch";
import { type AppContext, useApp } from "../../../lib/appContext";
import { parseProjectSplat, projectSlashPath } from "../../../lib/projectPath";
import { ProjectEmptyState } from "./components/ProjectEmptyState";
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
	const { ref, view } = parseProjectSplat(_splat);
	const project = useSuspenseQuery(projectOptions(context, ref)).data;
	const counts = useQuery(countsOptions(context, ref, search)).data;
	const full = viewOf(search);

	if (view === "settings") return <ProjectSettingsView project={project} />;

	const switchView = (next: ListView) =>
		navigate({
			to: "/p/$",
			params: { _splat: `${projectSlashPath(ref)}${next === "table" ? "" : "/board"}` },
			search,
		});

	const toggleScope = () =>
		navigate({
			to: "/p/$",
			params: { _splat },
			search: { ...search, scope: full.scope === "self" ? undefined : "self" },
		});

	const copyCli = async () => {
		await navigator.clipboard.writeText(toCli({ project: ref, ...toListQuery(full) }));
		toast("Copied the CLI command");
	};

	const createFirst = async (title: string) => {
		const ticket = await context.client.tickets.create({ project: ref, title });
		await context.queryClient.invalidateQueries();
		await navigate({ to: "/t/$identifier", params: { identifier: ticket.identifier } });
	};

	return (
		<>
			<Topbar actions={<ViewSwitch value={view} onChange={switchView} />}>
				<Breadcrumb path={ref} current={project.name} />
			</Topbar>
			<FilterBar
				actions={
					<Button variant="quiet" size="sm" icon={<Copy />} onClick={copyCli}>
						Copy as CLI
					</Button>
				}
			>
				<ScopeChip path={ref} scope={full.scope} onToggle={toggleScope} />
			</FilterBar>
			<div className="flex min-h-0 flex-1 flex-col">
				{counts !== undefined && counts.total === 0 ? (
					hasFilters(search) ? (
						<EmptyState
							title="No tickets match"
							description="Every filter above narrows the list."
							className="flex-1 justify-center"
							action={
								<Link
									to="/p/$"
									params={{ _splat }}
									search={{}}
									className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg hover:bg-bg"
								>
									Clear filters
								</Link>
							}
						/>
					) : (
						<ProjectEmptyState project={project} onCreate={createFirst} />
					)
				) : (
					<div className="flex flex-1 items-center justify-center text-sm text-fg-faint">
						{counts !== undefined && `${counts.total} tickets in the ${view}`}
					</div>
				)}
			</div>
			<ListFooter total={counts?.total} sort={sortLabel(full.sort)} />
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
