import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { AgentRun, TicketSummary, WaveSummary } from "@trellis/api";
import { Tabs, useMediaQuery } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { epicHref, projectHref } from "../../../lib/projectUrl";
import { FilterBar } from "../../filters/FilterBar";
import { type View, viewOf } from "../../filters/grammar";
import { useViewShareItems } from "../../filters/hooks/useViewShareItems";
import { hasFilters } from "../../filters/labels";
import { ArchivedBanner } from "../../project-actions";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { DisplayPopover } from "../../table/DisplayPopover";
import { useTicketMutations } from "../../table/hooks/useTicketMutations";
import { useWaveEditing } from "../../table/hooks/useWaveEditing";
import { TicketTable } from "../../table/TicketTable";
import { TableSkeleton } from "../../table/TicketTable/components/TableSkeleton";
import type { WaveStartAssignmentState } from "../../table/TicketTable/useWaveStart";
import { agentLinesByTicket } from "../../table/utils/agentLines";
import { DeleteEpicDialog } from "../DeleteEpicDialog";
import { EpicSheet } from "../EpicSheet";
import { EpicSwitcher } from "../EpicSwitcher";
import { epicWorkingTicketIds } from "../epicNext";
import { assignedTicketIds } from "../epicRowRank";
import { epicPageSearch, epicQueryString, epicUrlSearch } from "../epicSearch";
import { EpicBreadcrumb } from "./components/EpicBreadcrumb";
import { EpicCreateActions } from "./components/EpicCreateActions";
import { EpicEmptyState } from "./components/EpicEmptyState";
import { EpicLoadError } from "./components/EpicLoadError";
import { EpicPageContext } from "./components/EpicPageContext";
import { EpicResources } from "./components/EpicResources";
import { EpicTopbarActions } from "./components/EpicTopbarActions";
import type { EpicPageProps } from "./EpicPageProps";
import { useEpicAgentRuns } from "./hooks/useEpicAgentRuns";

const noRuns: readonly AgentRun[] = [];
const noWaves: readonly WaveSummary[] = [];
const noTickets: readonly TicketSummary[] = [];
const phoneTitleClass = "max-md:w-full";

// One epic, in two tabs. Overview is the tickets of the epic in the ticket
// table of the project routes, with nothing above the table. Resources is
// the documents and the files of the epic, with the epic description as the
// first document. The table search uses the URL search with `epic` fixed to this epic.
// The table groups by wave when the URL names no group. An epic belongs to one
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
	const ref = `${project.key}/${slug}`;
	const epic = useQuery(orpc.epics.get.queryOptions({ input: { epic: ref } }));
	const readOnly = project.archivedAt !== null;
	const routeKey = epicHref(project.key, slug);
	const splat = `${project.key}/epics/${slug}`;
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const epicAgentRuns = useEpicAgentRuns(ref);
	const runs = epicAgentRuns.data ?? noRuns;
	const assigned = useMemo(() => assignedTicketIds(runs), [runs]);
	const waveStartAssignment: WaveStartAssignmentState =
		epicAgentRuns.status === "pending"
			? { status: "loading" }
			: epicAgentRuns.status === "error"
				? {
						status: "error",
						detail: epicAgentRuns.error.message,
						retry: () => void epicAgentRuns.refetch(),
					}
				: { status: "ready", ticketIds: assigned };
	// A Set, because each row tests membership. Null until the query
	// succeeds: an empty set would read a ticket whose agent works as a
	// ticket that waits for the person, and the row would move when the
	// answer lands.
	const workingTicketIds = useMemo(
		() => (epicAgentRuns.status === "success" ? new Set(epicWorkingTicketIds(runs)) : null),
		[epicAgentRuns.status, runs],
	);
	// `agentLinesByTicket` shows closed runs in the epic table, so `useEpicAgentRuns` reads one exact row per ticket.
	const agentLines = useMemo(() => agentLinesByTicket(runs), [runs]);

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

	const parent = <EpicBreadcrumb project={project} />;

	// The search and the filter bar need the epic ref and the project alone,
	// so the pending page draws the same bar as the loaded page and the
	// topbar keeps its shape when the epic arrives.
	const phone = useMediaQuery("(max-width: 767px)");
	const tableSearch = useMemo(() => epicPageSearch(search, ref, phone), [search, ref, phone]);
	const { epic: fixedEpic, ...barSearch } = tableSearch;
	const full = viewOf(tableSearch);
	const shareItems = useViewShareItems({
		project: project.key,
		search: barSearch,
		statuses: project.statuses,
		fixed: { epic: ref },
		linkSearch: epicQueryString,
	});
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
			showShare={false}
			actions={
				<DisplayPopover
					routeKey={routeKey}
					tableKind="epic"
					showProject={false}
					epicFixed
					search={barSearch}
					onSearchChange={setSearch}
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
	const title = (epicRef: string, name: string, className?: string, wrap = false) => (
		<EpicSwitcher project={project.key} epicRef={epicRef} name={name} tab={tab} className={className} wrap={wrap} />
	);
	const identifiers = epic.data?.tickets.map((ticket) => ticket.identifier) ?? [];
	const topbar = (
		<Topbar
			actions={
				<EpicTopbarActions
					project={project.key}
					epic={epic.data ? { ref: epic.data.ref, name: epic.data.name, identifiers } : null}
					readOnly={readOnly}
					waveEditing={waveEditing}
					shareItems={shareItems}
					onAddTicket={(ticket) => void addTicket(ticket, epic.data?.ref ?? ref)}
					onEdit={() => setEditing(true)}
					onDelete={() => setDeleting(true)}
				/>
			}
		>
			<PageTitle parent={titleParent} title={phone ? null : title(epic.data?.ref ?? ref, epic.data?.name ?? slug)} />
			{filterBar}
		</Topbar>
	);

	if (epic.isPending) {
		return (
			<>
				{topbar}
				<EpicPageContext name={slug} phoneTitle={phone ? title(ref, slug, phoneTitleClass, true) : undefined} pending />
				<div className="page-card flex flex-1 flex-col overflow-hidden">
					{readOnly && <ArchivedBanner project={project} />}
					<div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
						<TableSkeleton />
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
				phone={phone}
				context={
					<EpicPageContext name={slug} phoneTitle={phone ? title(ref, slug, phoneTitleClass, true) : undefined} />
				}
			/>
		);
	}

	const record = epic.data;
	// The top bar and the empty state of the Overview share the Add menu.
	const createActions = readOnly ? null : (
		<EpicCreateActions
			epic={record.ref}
			project={project.key}
			exclude={identifiers}
			waveEditing={waveEditing}
			onAddTicket={(ticket) => void addTicket(ticket, record.ref)}
		/>
	);
	return (
		<>
			{topbar}
			<EpicPageContext
				name={record.name}
				phoneTitle={phone ? title(record.ref, record.name, phoneTitleClass, true) : undefined}
				epic={record}
			/>
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
											assignedTicketIds={waveStartAssignment}
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
