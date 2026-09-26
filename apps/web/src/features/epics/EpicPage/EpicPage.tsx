import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { AgentRun, Project, TicketSummary, WaveSummary } from "@trellis/api";
import { Tabs, useMediaQuery } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { epicHref, projectHref } from "../../../lib/projectUrl";
import { useUiStore } from "../../../stores/uiStore";
import { FilterBar } from "../../filters/FilterBar";
import { type View, viewOf } from "../../filters/grammar";
import { hasFilters } from "../../filters/labels";
import { ArchivedBanner } from "../../project-actions";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { DisplayPopover } from "../../table/DisplayPopover";
import { useTicketMutations } from "../../table/hooks/useTicketMutations";
import { useWaveEditing } from "../../table/hooks/useWaveEditing";
import { TicketTable } from "../../table/TicketTable";
import { TableSkeleton } from "../../table/TicketTable/components/TableSkeleton";
import { agentLinesByTicket } from "../../table/utils/agentLines";
import { DeleteEpicDialog } from "../DeleteEpicDialog";
import { EpicSheet } from "../EpicSheet";
import { EpicSwitcher } from "../EpicSwitcher";
import { epicWorkingTicketIds } from "../epicNext";
import { assignedTicketIds } from "../epicRowRank";
import { epicPageSearch, epicQueryString, epicUrlSearch } from "../epicSearch";
import { EpicCreateActions } from "./components/EpicCreateActions";
import { EpicEmptyState } from "./components/EpicEmptyState";
import { EpicLoadError } from "./components/EpicLoadError";
import { EpicResources } from "./components/EpicResources";
import { EpicTopbarActions } from "./components/EpicTopbarActions";

export type EpicPageProps = {
	project: Project;
	// The epic slug from the URL: `/p/OP/epics/<slug>`.
	slug: string;
	// The validated search of the URL. It holds the same params as the
	// project table, and never `epic`, because the path names the epic.
	search: Partial<View>;
	// Receives the next URL search after a filter or a display change.
	onSearchChange: (next: Partial<View>) => void;
};

const noRuns: readonly AgentRun[] = [];
const noWaves: readonly WaveSummary[] = [];
const noTickets: readonly TicketSummary[] = [];

// On a phone and on a touch screen the link is 44 px tall, the least a
// finger hits.
const breadcrumbLinkClass =
	"inline-flex h-7 max-md:h-11 pointer-coarse:h-11 items-center rounded-md px-1 text-fg-muted transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// One epic, in two tabs. Overview is the tickets of the epic in the ticket
// table of the project routes, with nothing above the table. Resources is
// the documents and the files of the epic, with the epic description as the
// first document. The Statistics sheet holds the counts of the epic. The
// table search is the URL search with `epic` fixed to this epic, and it
// groups by wave when the URL names no group. An epic belongs to one
// project, so the rows match the counts of the epic and the tickets that Add
// offers. The filter bar receives `epic` as a fixed filter,
// so it draws no epic chip and "Copy as CLI" still names the epic. Add puts
// a ticket of the project into the epic; the bulk bar of the table and the
// rail of the ticket page take one out. Both are ticket writes, so the ticket
// rows and the epic counts refetch from the ticket events.
// New wave adds a wave at the end of the epic, and every wave header of the
// table carries the actions of its wave (`useWaveEditing`).
export function EpicPage({ project, slug, search, onSearchChange }: EpicPageProps) {
	const { orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const resourceId = useLocation({ select: (location) => location.hash });
	const mutations = useTicketMutations();
	const storedDensity = useUiStore((state) => state.density);
	const ref = `${project.key}/${slug}`;
	const epic = useQuery(orpc.epics.get.queryOptions({ input: { epic: ref } }));
	const readOnly = project.archivedAt !== null;
	const routeKey = epicHref(project.key, slug);
	const splat = `${project.key}/epics/${slug}`;
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	// The assigned runs come from the query that the actor cell of every row
	// reads, so the row marks and the wave start dialog cost no request of
	// their own.
	const assignedRunsQuery = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { assigned: true } }),
		refetchOnWindowFocus: "always",
	});
	const assignedRuns = assignedRunsQuery.data;
	const assigned = useMemo(() => assignedTicketIds(assignedRuns ?? noRuns), [assignedRuns]);
	// A Set, because each row tests membership. Null until the query
	// succeeds: an empty set would read a ticket whose agent works as a
	// ticket that waits for the person, and the row would move when the
	// answer lands.
	const workingTicketIds = useMemo(
		() => (assignedRunsQuery.status === "success" ? new Set(epicWorkingTicketIds(assignedRuns ?? noRuns)) : null),
		[assignedRunsQuery.status, assignedRuns],
	);
	// The same `agentRuns.list` query as `assignedRuns` above, with another
	// `select`. A ticket row whose run holds an open request or a last
	// message is followed by one line.
	const agentLines = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { assigned: true } }),
		select: agentLinesByTicket,
		refetchOnWindowFocus: "always",
	}).data;

	const waveEditing = useWaveEditing({
		epicRef: ref,
		waves: epic.data?.waves ?? noWaves,
		tickets: epic.data?.tickets ?? noTickets,
		assignedTicketIds: assigned,
	});

	// The epic query refetches after the ticket write, because the write
	// response names no changed fields and the counts live on the epic.
	const addTicket = async (ticket: TicketSummary, epicRef: string) => {
		await mutations.updateMany([ticket], { epic: epicRef }, {}, (subject) => `${subject} did not join the epic.`);
		await queryClient.invalidateQueries({ queryKey: orpc.epics.key() });
	};

	const parent = (
		<span className="flex min-w-0 items-center gap-2">
			<ProjectBreadcrumb project={project} />
			<span aria-hidden="true" className="text-fg-faint">
				/
			</span>
			<Link to="/p/$" params={{ _splat: `${project.key}/epics` }} search={{}} className={breadcrumbLinkClass}>
				Epics
			</Link>
		</span>
	);

	// The search and the filter bar need the epic ref and the project alone,
	// so the pending page draws the same bar as the loaded page and the
	// topbar keeps its shape when the epic arrives.
	const phone = useMediaQuery("(max-width: 767px)");
	const tableSearch = useMemo(() => epicPageSearch(search, ref, phone), [search, ref, phone]);
	const { epic: fixedEpic, ...barSearch } = tableSearch;
	const full = viewOf(tableSearch);
	const setSearch = (next: Partial<View>) => onSearchChange(epicUrlSearch(next, phone));
	// The Overview tab opens first. The URL names the Resources tab alone, so
	// a shared link to the resources opens on them.
	const tab = search.tab ?? "overview";
	const setTab = (next: "overview" | "resources") =>
		setSearch({ ...tableSearch, tab: next === "resources" ? next : undefined });
	const filterBar = (
		<FilterBar
			project={project.key}
			search={barSearch}
			onSearchChange={setSearch}
			statuses={project.statuses}
			fixed={{ epic: ref }}
			linkSearch={epicQueryString}
			actions={
				<DisplayPopover
					routeKey={routeKey}
					tableKind="epic"
					showProject={false}
					epicFixed
					search={barSearch}
					onSearchChange={setSearch}
					density={search.density ?? storedDensity}
					group={full.group}
					sort={full.sort}
				/>
			}
		/>
	);
	const titleParent = phone ? undefined : parent;
	// The switcher is the title in both states, so the title keeps its box,
	// its caret and its height from the first paint. Until the epic answers
	// it carries the slug from the URL, the only name the page knows.
	const title = (epicRef: string, name: string) => (
		<EpicSwitcher project={project.key} epicRef={epicRef} name={name} tab={tab} />
	);

	if (epic.isPending) {
		return (
			<>
				<Topbar
					actions={
						<EpicTopbarActions
							project={project.key}
							epic={null}
							readOnly={readOnly}
							waveEditing={waveEditing}
							onAddTicket={() => {}}
							onEdit={() => setEditing(true)}
							onDelete={() => setDeleting(true)}
						/>
					}
				>
					<PageTitle parent={titleParent} title={title(ref, slug)} />
					{filterBar}
				</Topbar>
				<div className="page-card flex flex-1 flex-col overflow-hidden">
					{readOnly && <ArchivedBanner project={project} />}
					<div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
						<TableSkeleton density={search.density ?? storedDensity} />
					</div>
				</div>
			</>
		);
	}

	if (epic.isError) {
		return (
			<EpicLoadError
				epicRef={ref}
				slug={slug}
				parent={titleParent}
				error={epic.error}
				onRetry={() => void epic.refetch()}
			/>
		);
	}

	const record = epic.data;
	const identifiers = record.tickets.map((ticket) => ticket.identifier);
	// The top bar and the empty state of the Overview draw the same two buttons.
	const createActions = readOnly ? null : (
		<EpicCreateActions
			project={project.key}
			exclude={identifiers}
			waveEditing={waveEditing}
			onAddTicket={(ticket) => void addTicket(ticket, record.ref)}
		/>
	);
	return (
		<>
			<Topbar
				actions={
					<EpicTopbarActions
						project={project.key}
						epic={{ ref: record.ref, name: record.name, identifiers }}
						readOnly={readOnly}
						waveEditing={waveEditing}
						onAddTicket={(ticket) => void addTicket(ticket, record.ref)}
						onEdit={() => setEditing(true)}
						onDelete={() => setDeleting(true)}
					/>
				}
			>
				<PageTitle parent={titleParent} title={title(record.ref, record.name)} />
				{filterBar}
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{readOnly && <ArchivedBanner project={project} />}
				{/* The tab panels fill the card. The ticket table starts right under the tab strip. */}
				<Tabs
					value={tab}
					onValueChange={setTab}
					className="flex min-h-0 flex-1 flex-col [&>[role=tablist]]:shrink-0 [&>[role=tablist]]:px-5 max-md:[&>[role=tablist]]:px-4"
					panelClassName="flex min-h-0 flex-1 flex-col"
					items={[
						{
							value: "overview",
							label: "Overview",
							content:
								tab === "overview" ? (
									<fieldset disabled={readOnly} className="contents">
										<TicketTable
											project={project.key}
											routeKey={routeKey}
											tableKind="epic"
											search={tableSearch}
											workingTicketIds={workingTicketIds}
											assignedTicketIds={assignedRunsQuery.status === "success" ? assigned : undefined}
											prRows
											agentLines={agentLines}
											waveEditing={readOnly ? undefined : waveEditing}
											emptyState={
												<EpicEmptyState
													filtered={hasFilters(search)}
													q={search.q}
													splat={splat}
													actions={createActions}
												/>
											}
										/>
									</fieldset>
								) : null,
						},
						{
							value: "resources",
							label: (
								<span className="flex items-baseline gap-1.5">
									Resources
									<span className="text-xs text-fg-faint tabular">({record.resourceCount + 1})</span>
								</span>
							),
							content:
								tab === "resources" ? (
									<EpicResources
										epic={record.ref}
										description={record.description}
										readOnly={readOnly}
										resourceId={resourceId}
									/>
								) : null,
						},
					]}
				/>
			</div>
			{waveEditing.element}
			{editing && <EpicSheet project={project} epic={record} onClose={() => setEditing(false)} />}
			<DeleteEpicDialog
				epic={record}
				open={deleting}
				onOpenChange={setDeleting}
				onDeleted={() => void navigate({ href: projectHref(project.key, "epics") })}
			/>
		</>
	);
}
