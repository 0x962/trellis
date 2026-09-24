import { type ReactNode, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useScopeStatuses } from "../../../hooks/useScopeStatuses";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { useUiStore } from "../../../stores/uiStore";
import { useCommandContext } from "../../command/hooks/useCommandContext";
import { composerActions } from "../../composer/composerStore";
import { type View, viewOf } from "../../filters/grammar";
import { useScopeLabels } from "../../filters/hooks/useScopeLabels";
import { hasFilters } from "../../filters/labels";
import { BulkBar, type BulkPicker } from "../BulkBar";
import type { TableKind } from "../columns";
import { useApplyChange } from "../hooks/useApplyChange";
import { useBulkWrite } from "../hooks/useBulkWrite";
import { useExpandedTickets } from "../hooks/useExpandedTickets";
import { useRowSelection } from "../hooks/useRowSelection";
import { useTableCollapse } from "../hooks/useTableCollapse";
import { useTableData } from "../hooks/useTableData";
import { type TableGroupsOptions, useTableGroups } from "../hooks/useTableGroups";
import { useTableHotkeys } from "../hooks/useTableHotkeys";
import { useTicketMutations } from "../hooks/useTicketMutations";
import type { WaveEditing } from "../hooks/useWaveEditing";
import type { EditField } from "../Row";
import { TableEmpty } from "../TableEmpty";
import { TableFooter } from "../TableFooter";
import type { TicketAgentLine } from "../utils/agentLines";
import { epicState } from "../utils/epicState";
import { flattenGroups, type TableGroup } from "../utils/flattenGroups";
import { labelStates } from "../utils/labelStates";
import { visibleRows } from "../utils/visibleRows";
import { CapBanner } from "./components/CapBanner";
import { TableBody } from "./components/TableBody";
import { TableError } from "./components/TableError";
import { footerCounts } from "./footerCounts";
import { useRowActions } from "./useRowActions";
import { useVisibleColumns } from "./useVisibleColumns";
import { useWaveStart } from "./useWaveStart";
import { useWaveWrites } from "./useWaveWrites";

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
	// The epic route passes it, because what a row waits for reads it. Memoize
	// it: a new identity regroups the rows.
	workingTicketIds?: TableGroupsOptions["workingTicketIds"];
	// The ids of the tickets that hold an open agent run. The epic route
	// passes it once the assigned runs load, and a wave header then offers
	// Start wave.
	assignedTicketIds?: ReadonlySet<string>;
	// The wave writes of the epic route. Each wave header then offers the
	// wave actions, and a row drags into a wave group.
	waveEditing?: WaveEditing;
};

export type Editing = { id: string; field: EditField } | null;
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
	waveEditing,
}: TicketTableProps) {
	const view = viewOf(search);
	const storedDensity = useUiStore((state) => state.density);
	const density = search.density ?? storedDensity;
	const root = useRef<HTMLDivElement>(null);
	const pendingFocus = useRef<string | null>(null);
	const [focusState, setFocusState] = useState<string | null>(null);
	const [editing, setEditing] = useState<Editing>(null);
	const [bulkPicker, setBulkPicker] = useState<BulkPicker | null>(null);

	const showProject = project === undefined;

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
	const columnIds = useVisibleColumns({ routeKey, tableKind, showProject, group: view.group, rows: loaded });
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

	const applyChange = useApplyChange(mutations, bulk, labelGroups);

	const selectedTickets = () => selection.selected.map((id) => byId.get(id)!);
	const findTicket = (id: string) => byId.get(id);
	// How the selected tickets hold each label: `all` draws a check, `some`
	// draws a minus. A pick on a check removes the label everywhere, and a
	// pick on a minus adds it everywhere.
	const labels = labelStates(selectedTickets());
	// The epic and the wave each picker marks as current. The pickers
	// mark no row when the selection disagrees.
	const epics = epicState(selectedTickets());

	const rowActions = useRowActions({
		findTicket,
		selection,
		selectedTickets,
		applyChange,
		bulk,
		project,
		epicRef: epics.epicRef,
		onEditing: setEditing,
		onBulkPicker: setBulkPicker,
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

	const waveStart = useWaveStart({ groups, assignedTicketIds });
	const { waves, createWave } = useWaveWrites({
		waveEditing,
		project,
		epicRef: epics.epicRef,
		selectedTickets,
		ticketById: (id) => byId.get(id)!,
		applyChange,
		mutations,
		onNewTicket: openNew,
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
		openField: rowActions.openField,
		groupKeys: groups.filter((group) => group.label !== null).map((group) => group.key),
		toggleGroup: collapsed.toggle,
		openTicket: rowActions.openTicket,
		openPage: rowActions.openPage,
		openComposer: () => openNew(),
		copy: rowActions.copy,
		copySelection: rowActions.copyIds,
		requestDelete: rowActions.requestDelete,
	});
	useCommandContext(focusState === null ? null : (byId.get(focusState)?.identifier ?? null), selectedTickets(), {
		selectAll: selection.selectAll,
		clear: selection.clear,
	});

	if (data.error !== null) return <TableError error={data.error} onRetry={data.retry} />;
	// An epic whose waves hold no ticket draws the wave headers in place of
	// the empty state.
	const noGroups = !groupsLoading && groups.length === 0;
	if (data.total === 0 && noGroups && project !== undefined) {
		return (
			emptyState ?? <TableEmpty project={project} filtered={hasFilters(search)} q={view.q} onCreate={() => openNew()} />
		);
	}

	const { total, hidden } = footerCounts(data, view);
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
				loading={data.loading || groupsLoading}
				rowCount={ids.length}
				focusedId={focusedId}
				pendingFocus={pendingFocus}
				selection={selection}
				editing={editing}
				onFocusRow={setRowFocus}
				onRowClick={rowActions.onRowClick}
				onOpen={rowActions.openTicket}
				onEditingChange={rowActions.onEditingChange}
				onRowChange={rowActions.onRowChange}
				onToggleGroup={collapsed.toggle}
				onToggleTicket={expandedTickets.toggle}
				onCreateInGroup={openNew}
				waves={waves}
				pinHeaders={view.group === "wave"}
				onStartGroup={waveStart.onStartGroup}
				bottomRoom={selection.count > 0}
			/>
			<TableFooter total={total} hidden={hidden} sort={view.sort} />
			<BulkBar
				open={selection.count > 0}
				count={selection.count}
				statuses={data.statuses}
				project={project}
				labelIds={labels.all}
				mixedLabelIds={labels.some}
				{...epics}
				openPicker={selection.count > 0 ? bulkPicker : null}
				onOpenPickerChange={setBulkPicker}
				onLabel={(label, checked) => void applyChange(selectedTickets(), { label, checked }, "selection")}
				onStatus={(status) => void applyChange(selectedTickets(), { status }, "selection")}
				onPriority={(priority) => void applyChange(selectedTickets(), { priority }, "selection")}
				onParent={(parent) => void applyChange(selectedTickets(), { parent }, "selection")}
				onEpic={(epic) => void applyChange(selectedTickets(), { epic }, "selection")}
				onWave={(picked) => void applyChange(selectedTickets(), { wave: picked }, "selection")}
				onCreateWave={(name) => void createWave(name)}
				onCopyIds={rowActions.copyIds}
				onDelete={() => rowActions.requestDelete(selection.selected)}
				onClear={clearSelection}
			/>
			{bulk.confirmDialog}
			{waveStart.dialog}
		</div>
	);
}
