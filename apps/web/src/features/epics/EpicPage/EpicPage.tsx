import { ORPCError } from "@orpc/client";
import { PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { AgentRun, Project, TicketSummary } from "@trellis/api";
import { Button, EmptyState, IconButton, Menu } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { epicHref, projectHref, projectSlashPath, rootKey } from "../../../lib/projectPath";
import { useUiStore } from "../../../stores/uiStore";
import { FilterBar } from "../../filters/FilterBar";
import { type View, viewOf } from "../../filters/grammar";
import { hasFilters } from "../../filters/labels";
import { TicketPicker } from "../../pickers/TicketPicker";
import { ArchivedBanner } from "../../project-actions";
import { NotFoundState } from "../../shell/NotFoundState";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { DisplayPopover } from "../../table/DisplayPopover";
import { useTicketMutations } from "../../table/hooks/useTicketMutations";
import { TicketTable } from "../../table/TicketTable";
import { TableSkeleton } from "../../table/TicketTable/components/TableSkeleton";
import { agentLinesByTicket } from "../../table/utils/agentLines";
import { DeleteEpicDialog } from "../DeleteEpicDialog";
import { EpicSheet } from "../EpicSheet";
import { epicRunningCount, epicWorkingTicketIds } from "../epicNext";
import { assignedTicketIds, epicRowRank } from "../epicRowRank";
import { epicPageSearch, epicQueryString, epicUrlSearch } from "../epicSearch";
import { EpicPlan } from "./components/EpicPlan";
import { EpicProgress } from "./components/EpicProgress";
import { EpicResources } from "./components/EpicResources";

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

const clearLinkClass =
	"inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-base font-medium text-fg transition duration-hover hover:bg-bg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

const noRuns: readonly AgentRun[] = [];

const breadcrumbLinkClass =
	"inline-flex h-7 items-center rounded-md px-1 text-fg-muted transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// One epic: the progress band, the plan, the resources, and the tickets of
// the epic in the ticket table of the project routes. The table search is the URL search
// with `epic` fixed to this epic, and it groups by milestone when the URL
// names no group. An epic belongs to a root and holds tickets of any
// project of that root, so the table reads the root with its sub-projects,
// and the rows match the counts of the band and the tickets that Add
// offers. The filter bar receives `epic` as a fixed filter, so it draws no
// epic chip and "Copy as CLI" still names the epic. Add puts a ticket of the project into the epic; the bulk bar of the
// table and the rail of the ticket page take one out. Both are ticket
// writes, so the ticket rows and the epic counts refetch from the ticket
// events.
export function EpicPage({ project, slug, search, onSearchChange }: EpicPageProps) {
	const { orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const mutations = useTicketMutations();
	const storedDensity = useUiStore((state) => state.density);
	const ref = `${project.key}/${slug}`;
	const epic = useQuery(orpc.epics.get.queryOptions({ input: { epic: ref } }));
	const readOnly = project.archivedAt !== null;
	const routeKey = epicHref(project.path, slug);
	const splat = `${projectSlashPath(project.path)}/epics/${slug}`;
	const [editing, setEditing] = useState(false);
	const [deleting, setDeleting] = useState(false);
	// The assigned runs come from the query that the actor cell of every row
	// reads, so the order of the rows costs no request of its own. Inside a
	// milestone group the tickets that wait for the person come first, then
	// the tickets to start, then the running tickets.
	const assignedRunsQuery = useQuery(orpc.agentRuns.list.queryOptions({ input: { assigned: true } }));
	const assignedRuns = assignedRunsQuery.data;
	const assigned = useMemo(() => assignedTicketIds(assignedRuns ?? noRuns), [assignedRuns]);
	const rowRank = useMemo(() => epicRowRank(assigned), [assigned]);
	// A Set, because the turn of each row tests membership. Null until the
	// query succeeds: an empty set would read a ticket whose agent works as
	// the turn of the person, and the row would move when the answer lands.
	const workingTicketIds = useMemo(
		() => (assignedRunsQuery.status === "success" ? new Set(epicWorkingTicketIds(assignedRuns ?? noRuns)) : null),
		[assignedRunsQuery.status, assignedRuns],
	);
	const running = useMemo(
		() => (workingTicketIds !== null && epic.data !== undefined ? epicRunningCount(epic.data, workingTicketIds) : null),
		[workingTicketIds, epic.data],
	);
	// The same `agentRuns.list` query as `assignedRuns` above, with another
	// `select`. A ticket row whose run holds an open request or a last
	// message is followed by one line.
	const agentLines = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { assigned: true } }),
		select: agentLinesByTicket,
	}).data;

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
			<Link
				to="/p/$"
				params={{ _splat: `${projectSlashPath(project.path)}/epics` }}
				search={{}}
				className={breadcrumbLinkClass}
			>
				Epics
			</Link>
		</span>
	);

	// The search and the filter bar need the epic ref and the project alone,
	// so the pending page draws the same bar as the loaded page and the
	// topbar keeps its shape when the epic arrives.
	const tableSearch = useMemo(() => epicPageSearch(search, ref), [search, ref]);
	const { epic: fixedEpic, ...barSearch } = tableSearch;
	const full = viewOf(tableSearch);
	const setSearch = (next: Partial<View>) => onSearchChange(epicUrlSearch(next));
	const filterBar = (
		<FilterBar
			project={project.path}
			search={barSearch}
			onSearchChange={setSearch}
			statuses={project.statuses}
			fixed={{ epic: ref }}
			linkSearch={epicQueryString}
			actions={
				<DisplayPopover
					routeKey={routeKey}
					tableKind="epic"
					showProject={full.scope !== "self"}
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

	if (epic.isPending) {
		return (
			<>
				<Topbar>
					<PageTitle parent={parent} title={slug} />
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
		const notFound = epic.error instanceof ORPCError && epic.error.code === "NOT_FOUND";
		return (
			<>
				<Topbar>
					<PageTitle parent={parent} title={slug} />
				</Topbar>
				{notFound ? (
					<NotFoundState ref={ref} />
				) : (
					<EmptyState
						variant="page"
						className="page-card"
						title={`${ref} did not load.`}
						description={errorMessage(epic.error)}
						action={
							<Button size="md" onClick={() => void epic.refetch()}>
								Retry
							</Button>
						}
					/>
				)}
			</>
		);
	}

	const record = epic.data;
	const identifiers = record.tickets.map((ticket) => ticket.identifier);
	return (
		<>
			<Topbar
				actions={
					<>
						{!readOnly && (
							<TicketPicker
								project={project.key}
								exclude={identifiers}
								allowNone={false}
								label="Add to epic"
								placeholder="Add a ticket: an identifier or a title"
								triggerTooltip="Add tickets"
								onPick={(ticket) => {
									if (ticket !== null) void addTicket(ticket, record.ref);
								}}
								trigger={<IconButton label="Add tickets" icon={<Plus />} variant="default" />}
							/>
						)}
						<Menu
							label={`Actions for ${record.name}`}
							triggerTooltip="Epic actions"
							items={[
								{ label: "Edit", icon: <PencilSimple />, disabled: readOnly, onSelect: () => setEditing(true) },
								{
									label: "Delete…",
									icon: <Trash />,
									danger: true,
									disabled: readOnly,
									onSelect: () => setDeleting(true),
								},
							]}
						/>
					</>
				}
			>
				<PageTitle parent={parent} title={record.name} />
				{filterBar}
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{readOnly && <ArchivedBanner project={project} />}
				{/* The band, the plan and the resources take at most half of the card and scroll inside it, so the table always keeps rows on screen. */}
				<div className="max-h-1/2 shrink-0 overflow-y-auto border-b border-border">
					<EpicProgress
						epic={record}
						running={running}
						splat={splat}
						search={tableSearch}
						workingTicketIds={workingTicketIds}
					/>
					<EpicPlan routeKey={routeKey} description={record.description} />
					<EpicResources routeKey={routeKey} epic={record.ref} resourceCount={record.resourceCount} />
				</div>
				<fieldset disabled={readOnly} className="contents">
					<TicketTable
						project={rootKey(project.path)}
						routeKey={routeKey}
						tableKind="epic"
						search={tableSearch}
						rowRank={rowRank}
						workingTicketIds={workingTicketIds}
						prRows
						agentLines={agentLines}
						onOpenPage={(identifier) => void navigate({ to: "/t/$identifier", params: { identifier } })}
						emptyState={
							hasFilters(search) ? (
								<EmptyState
									variant="page"
									title={search.q === undefined ? "No tickets match" : `No tickets match '${search.q}'`}
									description="Clear the filters to see every ticket of the epic."
									action={
										<Link to="/p/$" params={{ _splat: splat }} search={{}} className={clearLinkClass}>
											Clear filters
										</Link>
									}
								/>
							) : (
								<EmptyState
									variant="page"
									title="No tickets"
									description="Add a ticket of the project to this epic. Its agent then reads the plan in its brief."
								/>
							)
						}
					/>
				</fieldset>
			</div>
			{editing && <EpicSheet project={project} epic={record} onClose={() => setEditing(false)} />}
			<DeleteEpicDialog
				epic={record}
				open={deleting}
				onOpenChange={setDeleting}
				onDeleted={() => void navigate({ href: projectHref(project.path, "epics") })}
			/>
		</>
	);
}
