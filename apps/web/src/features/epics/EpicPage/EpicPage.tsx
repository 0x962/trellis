import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { AgentRun, TicketSummary, WaveSummary } from "@trellis/api";
import { Tabs, useMediaQuery } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { projectHref } from "../../../lib/projectUrl";
import { FilterBar } from "../../filters/FilterBar";
import type { View } from "../../filters/grammar";
import { useViewShareItems } from "../../filters/hooks/useViewShareItems";
import { ArchivedBanner } from "../../project-actions";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { useTicketMutations } from "../../table/hooks/useTicketMutations";
import { useWaveEditing } from "../../table/hooks/useWaveEditing";
import { TableSkeleton } from "../../table/TicketTable/components/TableSkeleton";
import type { WaveStartAssignmentState } from "../../table/TicketTable/useWaveStart";
import { DeleteEpicDialog } from "../DeleteEpicDialog";
import { EpicSheet } from "../EpicSheet";
import { EpicSwitcher } from "../EpicSwitcher";
import { assignedTicketIds } from "../epicRowRank";
import { epicPageSearch, epicQueryString, epicUrlSearch } from "../epicSearch";
import { EpicLoadError } from "./components/EpicLoadError";
import { EpicPageContext } from "./components/EpicPageContext";
import { EpicResources } from "./components/EpicResources";
import { EpicTopbarActions } from "./components/EpicTopbarActions";
import { EpicWhiteboard } from "./components/EpicWhiteboard";
import type { EpicPageProps } from "./EpicPageProps";
import { useEpicAgentRuns } from "./hooks/useEpicAgentRuns";

const noRuns: readonly AgentRun[] = [];
const noWaves: readonly WaveSummary[] = [];
const noTickets: readonly TicketSummary[] = [];
const phoneTitleClass = "max-md:w-full";

// On a phone and on a touch screen the link is 44 px tall, the least a
// finger hits.
const breadcrumbLinkClass =
	"inline-flex h-7 max-md:h-11 pointer-coarse:h-11 items-center rounded-md px-1 text-fg-muted transition-colors duration-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

export function EpicPage({ project, slug, search, onSearchChange }: EpicPageProps) {
	const { orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const resourceId = useLocation({ select: (location) => location.hash });
	const mutations = useTicketMutations();
	const ref = `${project.key}/${slug}`;
	const epic = useQuery(orpc.epics.get.queryOptions({ input: { epic: ref } }));
	const readOnly = project.archivedAt !== null;
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
				<Tabs
					keepMounted
					value={tab}
					onValueChange={setTab}
					className="flex min-h-0 flex-1 flex-col [&>[role=tablist]]:shrink-0 [&>[role=tablist]]:px-5 max-md:[&>[role=tablist]]:px-4"
					panelClassName="flex min-h-0 flex-1 flex-col"
					items={[
						{
							value: "overview",
							label: "Overview",
							content: (
								<EpicWhiteboard
									epic={record}
									project={project}
									search={barSearch}
									assignment={waveStartAssignment}
									editing={waveEditing}
									readOnly={readOnly}
								/>
							),
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
