import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTable } from "@tanstack/react-table";
import type { TicketSummary } from "@trellis/api";
import { type MouseEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useScopeStatuses } from "../../../hooks/useScopeStatuses";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { useApp } from "../../../lib/appContext";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { useCommandContext } from "../../command/hooks/useCommandContext";
import { composerActions } from "../../composer/composerStore";
import { type View, viewOf } from "../../filters/grammar";
import { useScopeLabels } from "../../filters/hooks/useScopeLabels";
import { hasFilters } from "../../filters/labels";
import { BulkBar, type BulkPicker } from "../BulkBar";
import { buildColumns, type ColumnId, type TableKind, tableFeatureSet } from "../columns";
import { useApplyChange } from "../hooks/useApplyChange";
import { useBulkWrite } from "../hooks/useBulkWrite";
import { useCopyTickets } from "../hooks/useCopyTickets";
import { useExpandedTickets } from "../hooks/useExpandedTickets";
import { useRowSelection } from "../hooks/useRowSelection";
import { useTableCollapse } from "../hooks/useTableCollapse";
import { useTableData } from "../hooks/useTableData";
import { closedCategories, type TableGroupsOptions, useTableGroups } from "../hooks/useTableGroups";
import { type CopyKind, useTableHotkeys } from "../hooks/useTableHotkeys";
import { useTicketMutations } from "../hooks/useTicketMutations";
import type { EditField, RowChange } from "../Row";
import { TableEmpty } from "../TableEmpty";
import { TableFooter } from "../TableFooter";
import type { TicketAgentLine } from "../utils/agentLines";
import { autoHide, columnVisibility } from "../utils/columnVisibility";
import { epicState } from "../utils/epicState";
import { flattenGroups, type TableGroup } from "../utils/flattenGroups";
import { labelStates } from "../utils/labelStates";
import { visibleRows } from "../utils/visibleRows";
import { WaveStartDialog } from "../WaveStart";
import { CapBanner } from "./components/CapBanner";
import { TableBody } from "./components/TableBody";
import { TableError } from "./components/TableError";
import { rowClickOpens } from "./rowClickOpens";

export type TicketTableProps = {
	// The project ref of the route, or undefined for a table over every project.
	project?: string;
	// The pathname, which keys the stored preferences.
	routeKey: string;
	// The kind of table this route draws. Only an epic table shows the
	// `waits` and the `releases` columns.
	tableKind?: TableKind;
	search: Partial<View>;
	emptyState?: ReactNode;
	// Orders the rows of each group ahead of the view sort. Memoize it: a new identity regroups the rows.
	rowRank?: TableGroupsOptions["rowRank"];
	// True on the epic route: a ticket row is followed by one line per pull
	// request linked to that ticket.
	prRows?: boolean;
	// What the run of a ticket says, keyed by ticket id. A ticket row with
	// an entry is followed by one agent line. Memoize it: a new identity
	// rebuilds every line of the list.
	agentLines?: Readonly<Record<string, TicketAgentLine>>;
	// The epic route passes it, because the turn of a row reads it. Memoize
	// it: a new identity regroups the rows.
	workingTicketIds?: TableGroupsOptions["workingTicketIds"];
	// The ids of the tickets that hold an open agent run. The epic route
	// passes it once the assigned runs load, and a wave header then offers
	// Start wave.
	assignedTicketIds?: ReadonlySet<string>;
};

export type Editing = { id: string; field: EditField } | null;
const columns = buildColumns();
const noTickets: TicketSummary[] = [];
const focusFilter = () => document.querySelector<HTMLElement>("[data-filter-bar] [data-filter-button]")?.focus();

// The ticket table of a list route: the active rows grouped client-side,
// the closed groups on demand, the roving focus, the id-keyed selection,
// the inline pickers, and the bulk bar.
export function TicketTable({
	project,
	routeKey,
	tableKind = "list",
	search,
	emptyState,
	rowRank,
	prRows = false,
	agentLines,
	workingTicketIds,
	assignedTicketIds,
}: TicketTableProps) {
	const { orpc } = useApp();
	const navigate = useNavigate();
	const view = viewOf(search);
	const storedDensity = useUiStore((state) => state.density);
	const density = search.density ?? storedDensity;
	const root = useRef<HTMLDivElement>(null);
	const pendingFocus = useRef<string | null>(null);
	const [focusState, setFocusState] = useState<string | null>(null);
	const [editing, setEditing] = useState<Editing>(null);
	const [bulkPicker, setBulkPicker] = useState<BulkPicker | null>(null);
	// The key of the wave group whose Start wave dialog is open or was open
	// last. It stays set while the dialog closes, so the dialog keeps its
	// lists through the close motion.
	const [startKey, setStartKey] = useState<string | null>(null);
	const [startOpen, setStartOpen] = useState(false);

	const projectQuery = useQuery({
		...orpc.projects.get.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
	});
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? [];
	const showProject = project === undefined || ((projectQuery.data?.children.length ?? 0) > 0 && view.scope !== "self");

	const statuses = useScopeStatuses(project);
	const labelGroups = useScopeLabels(project).groups;
	const { collapsed, expanded } = useTableCollapse(routeKey, statuses, view);
	const expandedTickets = useExpandedTickets(routeKey);
	const data = useTableData({ project, view, expanded });
	const { groups, loading: groupsLoading } = useTableGroups({
		data,
		view,
		project,
		isCollapsed: collapsed.isCollapsed,
		rowRank,
		workingTicketIds,
	});
	const items = useMemo(
		() => flattenGroups(groups, { prRows, agentLines, expandedTickets: expandedTickets.expanded }),
		[groups, prRows, agentLines, expandedTickets.expanded],
	);
	const loaded = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
	// The selection, the focus, and every key run over the rows a person can
	// see. A row inside a collapsed group is loaded but not visible, so it
	// stays out of all three.
	const tickets = useMemo(() => visibleRows(items), [items]);
	const ids = useMemo(() => tickets.map((ticket) => ticket.id), [tickets]);
	const byId = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets]);
	const stored = useUiStore((state) => state.columnVisibility[routeKey]);
	const visibility = useMemo(
		() => autoHide(columnVisibility(stored, showProject, tableKind), { group: view.group, rows: loaded }),
		[stored, showProject, tableKind, view.group, loaded],
	);
	const table = useTable({
		features: tableFeatureSet,
		columns,
		data: noTickets,
		state: { columnVisibility: visibility },
		onColumnVisibilityChange: (updater) => {
			const next = typeof updater === "function" ? updater(visibility) : updater;
			for (const [id, visible] of Object.entries(next)) {
				if (visible !== visibility[id as ColumnId]) uiActions.setColumnVisible(routeKey, id, visible);
			}
		},
	});
	const columnIds = table.getVisibleLeafColumns().map((column) => column.id as ColumnId);
	const selection = useRowSelection({ ids });
	const mutations = useTicketMutations();
	// An empty selection leaves no control for a bulk picker to hang on, so
	// the picker closes with it.
	const clearSelection = useStableCallback(() => {
		setBulkPicker(null);
		selection.clear();
	});
	// A delete clears the selection, because the deleted ids name nothing.
	// Every other bulk write keeps it.
	const bulk = useBulkWrite({ onDeleted: clearSelection });

	const focusedId = (focusState !== null && byId.has(focusState) ? focusState : undefined) ?? ids[0] ?? null;
	const setRowFocus = useStableCallback((id: string) => flushSync(() => setFocusState(id)));

	const focus = useStableCallback((id: string) => {
		pendingFocus.current = id;
		setFocusState(id);
	});
	const blur = useStableCallback(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});

	const applyChange = useApplyChange(mutations, bulk, projects, labelGroups);

	const selectedTickets = () => selection.selected.map((id) => byId.get(id)!);
	const projectRootIds = new Map(projects.map((project) => [project.id, project.rootId]));
	const ticketRootIds = [
		...new Set(
			selectedTickets()
				.map((ticket) => projectRootIds.get(ticket.project.id))
				.filter((id): id is string => id !== undefined),
		),
	];

	// How the selected tickets hold each label: `all` draws a check, `some`
	// draws a minus. A pick on a check removes the label everywhere, and a
	// pick on a minus adds it everywhere.
	const labels = labelStates(selectedTickets());
	// The epic and the wave each picker marks as current. The pickers
	// mark no row when the selection disagrees.
	const epics = epicState(selectedTickets());

	// A change on a selected row writes to the whole selection. A change on
	// a row the selection does not hold writes to that row alone.
	const onRowChange = useStableCallback((ticket: TicketSummary, change: RowChange) => {
		if (selection.isSelected(ticket.id)) void applyChange(selectedTickets(), change, "selection");
		else void applyChange([ticket], change, "row");
	});

	// A click and Enter open the ticket in the sheet over this list, so the
	// list keeps its scroll. The `o` key opens the ticket page on its route.
	const openTicket = useStableCallback((id: string) => {
		const ticket = byId.get(id);
		if (ticket !== undefined) pageSheetActions.openTicket(ticket.identifier);
	});
	const openPage = useStableCallback((id: string) =>
		navigate({ to: "/t/$identifier", params: { identifier: byId.get(id)!.identifier } }),
	);

	const copier = useCopyTickets();
	const copy = useStableCallback((id: string, kind: CopyKind) => void copier.copy(byId.get(id)!, kind));
	const copyIds = () => void copier.copyIds(selectedTickets());

	const requestDelete = (targets: readonly string[]) =>
		void bulk.remove(targets.map((id) => byId.get(id)).filter((ticket) => ticket !== undefined));

	const onRowClick = useStableCallback((id: string, event: MouseEvent) => {
		// The link that covers the whole row (`data-row-link` in `Row`) forwards
		// its plain click here, with the link as `currentTarget`.
		if (!rowClickOpens(event.target as Element, event.currentTarget as Node)) return;
		if (event.shiftKey) selection.extend(id);
		else if (event.metaKey || event.ctrlKey) selection.toggle(id);
		else openTicket(id);
	});

	const onEditingChange = useStableCallback((id: string, field: EditField | null) =>
		setEditing(field === null ? null : { id, field }),
	);

	// A field key writes to the whole selection when one exists, and to the
	// focused row when none does. The bulk bar owns the labels and the epic
	// of a route with no project, so those two keys fall back to the row.
	const barHasField = (field: EditField) => (field === "labels" || field === "epic" ? project !== undefined : true);
	const openField = useStableCallback((id: string, field: EditField) => {
		if (selection.count > 0 && barHasField(field)) setBulkPicker(field);
		else setEditing({ id, field });
	});

	// A table of one epic creates the ticket inside that epic, and inside the
	// wave of the group whose header opened the composer.
	const openNew = (group?: TableGroup) =>
		composerActions.open({
			...(group?.status === undefined ? {} : { status: group.status.slug }),
			...(project === undefined ? {} : { project }),
			epic: group?.epicRef ?? (view.epic === "none" ? undefined : view.epic),
			wave: group?.wave?.ref,
		});

	useTableHotkeys({
		root,
		ids,
		focusedId,
		focus,
		blur,
		selection,
		editing,
		setEditing,
		openField,
		groupKeys: groups.filter((group) => group.label !== null).map((group) => group.key),
		toggleGroup: collapsed.toggle,
		openTicket,
		openPage,
		openComposer: () => openNew(),
		copy,
		copySelection: copyIds,
		requestDelete,
	});
	useCommandContext(focusState === null ? null : (byId.get(focusState)?.identifier ?? null), selectedTickets(), {
		selectAll: selection.selectAll,
		clear: selection.clear,
	});

	if (data.error !== null) return <TableError error={data.error} onRetry={data.retry} />;
	if (data.total === 0 && project !== undefined && projectQuery.data?.parentId === null) {
		return (
			emptyState ?? <TableEmpty project={project} filtered={hasFilters(search)} q={view.q} onCreate={() => openNew()} />
		);
	}

	const startGroup = startKey === null ? undefined : groups.find((group) => group.key === startKey);
	const closedVisible =
		data.closed !== null && ((view.group === "status" && view.closed !== "hide") || data.inlineClosed !== null);
	const closedTotal = closedVisible
		? closedCategories.reduce((sum, category) => sum + data.closed![category].count, 0)
		: 0;
	const loadedTotal = data.rows.length + closedTotal;
	// Under a grouping that holds no closed rows the rows are the open tickets
	// only, and the footer names the Done and Canceled tickets it leaves out. The
	// server total counts them, so the open count subtracts them.
	const hidden = data.closed !== null && !closedVisible ? data.closed.done.count + data.closed.canceled.count : 0;
	const total = data.allActiveLoaded ? loadedTotal : (data.total ?? loadedTotal) - hidden;
	return (
		<div ref={root} data-ticket-table="" className="relative flex min-h-0 flex-1 flex-col">
			{data.capped && <CapBanner onNarrow={focusFilter} />}
			<TableBody
				items={items}
				tableKind={tableKind}
				columns={columnIds}
				density={density}
				project={project}
				statuses={data.statuses}
				projects={projects}
				loading={data.loading || groupsLoading}
				rowCount={ids.length}
				focusedId={focusedId}
				pendingFocus={pendingFocus}
				selection={selection}
				editing={editing}
				onFocusRow={setRowFocus}
				onRowClick={onRowClick}
				onOpen={openTicket}
				onEditingChange={onEditingChange}
				onRowChange={onRowChange}
				onToggleGroup={collapsed.toggle}
				onToggleTicket={expandedTickets.toggle}
				onCreateInGroup={openNew}
				onStartGroup={
					assignedTicketIds !== undefined
						? (group) => {
								setStartKey(group.key);
								setStartOpen(true);
							}
						: undefined
				}
				bottomRoom={selection.count > 0}
			/>
			<TableFooter total={total} hidden={hidden} sort={view.sort} />
			<BulkBar
				open={selection.count > 0}
				count={selection.count}
				statuses={data.statuses}
				projects={projects}
				ticketRootIds={ticketRootIds}
				project={project}
				labelIds={labels.all}
				mixedLabelIds={labels.some}
				{...epics}
				openPicker={selection.count > 0 ? bulkPicker : null}
				onOpenPickerChange={setBulkPicker}
				onLabel={(label, checked) => void applyChange(selectedTickets(), { label, checked }, "selection")}
				onStatus={(status) => void applyChange(selectedTickets(), { status }, "selection")}
				onPriority={(priority) => void applyChange(selectedTickets(), { priority }, "selection")}
				onProject={(ref) => void applyChange(selectedTickets(), { project: ref }, "selection")}
				onParent={(parent) => void applyChange(selectedTickets(), { parent }, "selection")}
				onEpic={(epic) => void applyChange(selectedTickets(), { epic }, "selection")}
				onWave={(picked) => void applyChange(selectedTickets(), { wave: picked }, "selection")}
				onCopyIds={copyIds}
				onDelete={() => requestDelete(selection.selected)}
				onClear={clearSelection}
			/>
			{bulk.confirmDialog}
			{startGroup !== undefined && assignedTicketIds !== undefined && (
				<WaveStartDialog
					open={startOpen}
					onOpenChange={setStartOpen}
					wave={startGroup.label ?? ""}
					tickets={startGroup.rows}
					assigned={assignedTicketIds}
				/>
			)}
		</div>
	);
}
