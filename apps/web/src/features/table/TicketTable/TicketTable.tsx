import { useQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import type { StatusSummary, TicketSummary } from "@trellis/api";
import { type MouseEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useScopeStatuses } from "../../../hooks/useScopeStatuses";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { useApp } from "../../../lib/appContext";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { useCommandContext } from "../../command/hooks/useCommandContext";
import { composerActions } from "../../composer/composerStore";
import { type View, viewOf } from "../../filters/grammar";
import { hasFilters } from "../../filters/labels";
import { BulkBar } from "../BulkBar";
import { buildColumns, type ColumnId, tableFeatureSet } from "../columns";
import { useApplyChange } from "../hooks/useApplyChange";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups";
import { useCopyTickets } from "../hooks/useCopyTickets";
import { useRowSelection } from "../hooks/useRowSelection";
import { useTableData } from "../hooks/useTableData";
import { closedCategories, closedKey, useTableGroups } from "../hooks/useTableGroups";
import { type CopyKind, useTableHotkeys } from "../hooks/useTableHotkeys";
import { useTicketMutations } from "../hooks/useTicketMutations";
import type { EditField, RowChange } from "../Row";
import { TableEmpty } from "../TableEmpty";
import { TableFooter } from "../TableFooter";
import { autoHide, columnVisibility } from "../utils/columnVisibility";
import { flattenGroups } from "../utils/flattenGroups";
import { CapBanner } from "./components/CapBanner";
import { TableBody } from "./components/TableBody";
import { TableError } from "./components/TableError";

export type TicketTableProps = {
	// The project ref of the route, or undefined on /all.
	project?: string;
	// The pathname, which keys the stored preferences.
	routeKey: string;
	search: Partial<View>;
	onOpenPage: (identifier: string) => void;
	emptyState?: ReactNode;
};

export type Editing = { id: string; field: EditField } | null;
const columns = buildColumns();
const noTickets: TicketSummary[] = [];
const focusFilter = () => document.querySelector<HTMLElement>("[data-filter-bar] [data-filter-button]")?.focus();

// The ticket table of a list route: the active rows grouped client-side,
// the closed groups on demand, the roving focus, the id-keyed selection,
// the inline pickers, and the bulk bar.
export function TicketTable({ project, routeKey, search, onOpenPage, emptyState }: TicketTableProps) {
	const { orpc } = useApp();
	const view = viewOf(search);
	const storedDensity = useUiStore((state) => state.density);
	const density = search.density ?? storedDensity;
	const root = useRef<HTMLDivElement>(null);
	const pendingFocus = useRef<string | null>(null);
	const [focusState, setFocusState] = useState<string | null>(null);
	const [editing, setEditing] = useState<Editing>(null);
	const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

	const projectQuery = useQuery({
		...orpc.projects.get.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
	});
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? [];
	const showProject = project === undefined || ((projectQuery.data?.children.length ?? 0) > 0 && view.scope !== "self");

	const statuses = useScopeStatuses(project);
	const closedKeys = useMemo(
		() => closedCategories.map((category) => closedKey(statuses, category)).filter((key) => key !== undefined),
		[statuses],
	);
	const collapsed = useCollapsedGroups(routeKey, closedKeys);
	const expanded = closedCategories.filter((category) => {
		const key = closedKey(statuses, category);
		return key !== undefined && !collapsed.isCollapsed(key);
	});
	const data = useTableData({ project, view, expanded });
	const groups = useTableGroups({ data, view, project, isCollapsed: collapsed.isCollapsed });
	const items = useMemo(() => flattenGroups(groups), [groups]);
	const tickets = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
	const ids = useMemo(() => tickets.map((ticket) => ticket.id), [tickets]);
	const byId = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets]);
	const stored = useUiStore((state) => state.columnVisibility[routeKey]);
	const visibility = useMemo(
		() => autoHide(columnVisibility(stored, showProject), { group: view.group, rows: tickets }),
		[stored, showProject, view.group, tickets],
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

	const focusedId = (focusState !== null && byId.has(focusState) ? focusState : undefined) ?? ids[0] ?? null;
	const setRowFocus = useStableCallback((id: string) => flushSync(() => setFocusState(id)));

	const focus = useStableCallback((id: string) => {
		pendingFocus.current = id;
		setFocusState(id);
	});
	const blur = useStableCallback(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});

	const applyChange = useApplyChange(mutations, projects);

	const selectedTickets = () => selection.selected.map((id) => byId.get(id)!);

	const onRowChange = useStableCallback((ticket: TicketSummary, change: RowChange) => {
		void applyChange(selection.isSelected(ticket.id) ? selectedTickets() : [ticket], change);
	});

	const openTicket = useStableCallback((id: string) => {
		const ticket = byId.get(id);
		if (ticket !== undefined) onOpenPage(ticket.identifier);
	});

	const copier = useCopyTickets();
	const copy = useStableCallback((id: string, kind: CopyKind) => void copier.copy(byId.get(id)!, kind));
	const copyIds = () => void copier.copyIds(selectedTickets());

	const confirmDelete = async () => {
		const targets = (pendingDelete ?? []).map((id) => byId.get(id)).filter((ticket) => ticket !== undefined);
		setPendingDelete(null);
		if (targets.length === 1) await mutations.remove(targets[0]!);
		else if (targets.length > 1) await mutations.removeMany(targets);
		selection.clear();
	};

	const onRowClick = useStableCallback((id: string, event: MouseEvent) => {
		if ((event.target as HTMLElement).closest("button, a, [role=checkbox]") !== null) return;
		if (event.shiftKey) selection.extend(id);
		else if (event.metaKey || event.ctrlKey) selection.toggle(id);
		else openTicket(id);
	});

	const onEditingChange = useStableCallback((id: string, field: EditField | null) =>
		setEditing(field === null ? null : { id, field }),
	);

	const openNew = (status?: StatusSummary) =>
		composerActions.open({
			...(status === undefined ? {} : { status: status.slug }),
			...(project === undefined ? {} : { project }),
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
		groupKeys: groups.filter((group) => group.label !== null).map((group) => group.key),
		toggleGroup: collapsed.toggle,
		openTicket,
		openPage: (id) => onOpenPage(byId.get(id)!.identifier),
		openComposer: () => openNew(),
		copy,
		copySelection: copyIds,
		requestDelete: (targets) => setPendingDelete([...targets]),
	});
	useCommandContext(
		focusState === null ? null : (byId.get(focusState)?.identifier ?? null),
		selection.selected.map((id) => byId.get(id)!.identifier),
	);

	if (data.error !== null) return <TableError error={data.error} onRetry={data.retry} />;
	if (data.total === 0 && (project === undefined || projectQuery.data?.parentId === null)) {
		return (
			emptyState ?? <TableEmpty project={project} filtered={hasFilters(search)} q={view.q} onCreate={() => openNew()} />
		);
	}

	const closedVisible = data.closed !== null && view.group === "status" && view.closed !== "hide";
	const closedTotal = closedVisible
		? closedCategories.reduce((sum, category) => sum + data.closed![category].count, 0)
		: 0;
	const loadedTotal = data.rows.length + closedTotal;
	// Under a grouping other than status the rows are the open tickets only,
	// and the footer names the Done and Canceled tickets it leaves out. The
	// server total counts them, so the open count subtracts them.
	const hidden = data.closed !== null && !closedVisible ? data.closed.done.count + data.closed.canceled.count : 0;
	const total = data.allActiveLoaded ? loadedTotal : (data.total ?? loadedTotal) - hidden;
	const count = pendingDelete?.length ?? 0;
	const deleteTitle =
		count === 1 ? `Delete ${byId.get(pendingDelete![0]!)?.identifier ?? "the ticket"}?` : `Delete ${count} tickets?`;

	return (
		<div ref={root} data-ticket-table="" className="relative flex min-h-0 flex-1 flex-col">
			{data.capped && <CapBanner onNarrow={focusFilter} />}
			<TableBody
				items={items}
				columns={columnIds}
				density={density}
				project={project}
				statuses={data.statuses}
				projects={projects}
				loading={data.loading}
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
				onCreateInGroup={openNew}
				bottomRoom={selection.count > 0}
			/>
			<TableFooter total={total} hidden={hidden} sort={view.sort} />
			<BulkBar
				open={selection.count > 0}
				count={selection.count}
				statuses={data.statuses}
				projects={projects}
				project={project}
				onStatus={(status) => void applyChange(selectedTickets(), { status })}
				onPriority={(priority) => void applyChange(selectedTickets(), { priority })}
				onProject={(ref) => void applyChange(selectedTickets(), { project: ref })}
				onParent={(parent) => void applyChange(selectedTickets(), { parent })}
				onCopyIds={copyIds}
				onDelete={() => setPendingDelete(selection.selected)}
				onClear={selection.clear}
			/>
			<ConfirmDialog
				open={pendingDelete !== null}
				title={deleteTitle}
				description="trellis cannot restore a deleted ticket. Its sub-tickets stay and lose their parent."
				confirmLabel="Delete"
				danger
				onConfirm={() => void confirmDelete()}
				onCancel={() => setPendingDelete(null)}
			/>
		</div>
	);
}
