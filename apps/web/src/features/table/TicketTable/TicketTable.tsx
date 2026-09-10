import { useQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import type { StatusSummary, TicketSummary } from "@trellis/api";
import { toast } from "@trellis/ui";
import { type MouseEvent, type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useScopeStatuses } from "../../../hooks/useScopeStatuses";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { useApp } from "../../../lib/appContext";
import { branchName } from "../../../lib/branchName";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { useCommandContext } from "../../command/hooks/useCommandContext";
import { composerActions } from "../../composer/composerStore";
import { type View, viewOf } from "../../filters/grammar";
import { hasFilters } from "../../filters/labels";
import { PeekListProvider } from "../../ticket/TicketPeek/providers/PeekListProvider";
import { BulkBar } from "../BulkBar";
import { buildColumns, type ColumnId, tableFeatureSet } from "../columns";
import { useApplyChange } from "../hooks/useApplyChange";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups";
import { useRowSelection } from "../hooks/useRowSelection";
import { useTableData } from "../hooks/useTableData";
import { closedCategories, closedKey, useTableGroups } from "../hooks/useTableGroups";
import { type CopyKind, useTableHotkeys } from "../hooks/useTableHotkeys";
import { useTicketMutations } from "../hooks/useTicketMutations";
import type { EditField, RowChange } from "../Row";
import { TableEmpty } from "../TableEmpty";
import { TableError } from "./components/TableError";
import { TableFooter } from "../TableFooter";
import { columnVisibility } from "../utils/columnVisibility";
import { flattenGroups } from "../utils/flattenGroups";
import { CapBanner } from "./components/CapBanner";
import { ColumnHeaderRow } from "./components/ColumnHeaderRow";
import { TableBody } from "./components/TableBody";

export type TicketTableProps = {
	// The project ref of the route, or undefined on /all.
	project?: string;
	// The pathname, which keys the stored preferences.
	routeKey: string;
	search: Partial<View>;
	onSearchChange: (next: Partial<View>) => void;
	onOpenPage: (identifier: string) => void;
	// Renders inside the table's peek list, so a peek there walks the rows in
	// display order.
	children?: ReactNode;
};

export type Editing = { id: string; field: EditField } | null;
const columns = buildColumns();
const noTickets: TicketSummary[] = [];
const focusFilter = () => document.querySelector<HTMLElement>("[data-filter-bar] [data-filter-button]")?.focus();

// The ticket table of a list route: the active rows grouped client-side,
// the closed groups on demand, the roving focus, the id-keyed selection,
// the inline pickers, and the bulk bar.
export function TicketTable({ project, routeKey, search, onSearchChange, onOpenPage, children }: TicketTableProps) {
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
	const stored = useUiStore((state) => state.columnVisibility[routeKey]);
	const visibility = useMemo(() => columnVisibility(stored, showProject), [stored, showProject]);
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
	const selection = useRowSelection({ ids });
	const mutations = useTicketMutations();

	const peekId = view.peek === undefined ? undefined : tickets.find((ticket) => ticket.identifier === view.peek)?.id;
	const focusedId = (focusState !== null && byId.has(focusState) ? focusState : undefined) ?? peekId ?? ids[0] ?? null;
	const setRowFocus = useStableCallback((id: string) => flushSync(() => setFocusState(id)));

	const focus = useStableCallback((id: string) => {
		pendingFocus.current = id;
		setFocusState(id);
	});
	const blur = useStableCallback(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});

	// When the peek closes, the focus goes to the row of the ticket that the
	// peek showed last. Base UI returns the focus only to the element that had
	// it before the peek opened, and a j or k step just before Escape can make
	// it skip that return and leave the focus on the page body.
	// The row can already hold the table focus state, so `focus` can cause no
	// render. TableBody focuses the row in a passive effect of this same
	// commit, and that effect runs after this layout effect sets
	// `pendingFocus`.
	const lastPeek = useRef(view.peek);
	useLayoutEffect(() => {
		const closed = lastPeek.current;
		lastPeek.current = view.peek;
		if (closed === undefined || view.peek !== undefined) return;
		const ticket = tickets.find((row) => row.identifier === closed);
		if (ticket !== undefined) focus(ticket.id);
	}, [view.peek, tickets, focus]);

	const applyChange = useApplyChange(mutations, projects);
	// The rows the peek walks with j and k, in display order. A row in a
	// collapsed group stays in the list but is not visible.
	const peekRows = useMemo(
		() => groups.flatMap((group) => group.rows.map((row) => ({ identifier: row.identifier, visible: group.expanded }))),
		[groups],
	);

	const selectedTickets = () => selection.selected.map((id) => byId.get(id)!);

	const onRowChange = useStableCallback((ticket: TicketSummary, change: RowChange) => {
		void applyChange(selection.isSelected(ticket.id) ? selectedTickets() : [ticket], change);
	});

	const openPeek = useStableCallback((id: string) => {
		const ticket = byId.get(id);
		if (ticket !== undefined) onSearchChange({ ...search, peek: ticket.identifier });
	});

	const copy = useStableCallback(async (id: string, kind: CopyKind) => {
		const ticket = byId.get(id)!;
		const text =
			kind === "id"
				? ticket.identifier
				: kind === "branch"
					? branchName(ticket.identifier, ticket.title)
					: `${window.location.origin}/t/${ticket.identifier}`;
		await navigator.clipboard.writeText(text);
		toast(`Copied ${text}`);
	});

	const copyIds = async () => {
		await navigator.clipboard.writeText(
			selectedTickets()
				.map((ticket) => ticket.identifier)
				.join("\n"),
		);
		toast(`Copied ${selection.count} IDs`);
	};

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
		else openPeek(id);
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
		openPeek,
		openPage: (id) => onOpenPage(byId.get(id)!.identifier),
		openComposer: () => openNew(),
		copy,
		requestDelete: (targets) => setPendingDelete([...targets]),
	});
	useCommandContext(
		focusState === null ? null : (byId.get(focusState)?.identifier ?? null),
		selection.selected.map((id) => byId.get(id)!.identifier),
	);

	if (data.error !== null) return <TableError error={data.error} onRetry={data.retry} />;
	if (data.total === 0 && (project === undefined || projectQuery.data?.parentId === null)) {
		return <TableEmpty project={project} filtered={hasFilters(search)} q={view.q} onCreate={() => openNew()} />;
	}

	const closedVisible = data.closed !== null && view.group === "status";
	const closedTotal = closedVisible
		? closedCategories.reduce((sum, category) => sum + data.closed![category].count, 0)
		: 0;
	const loadedTotal = data.rows.length + closedTotal;
	const total = data.allActiveLoaded ? loadedTotal : (data.total ?? loadedTotal);
	const count = pendingDelete?.length ?? 0;
	const deleteTitle =
		count === 1 ? `Delete ${byId.get(pendingDelete![0]!)?.identifier ?? "the ticket"}?` : `Delete ${count} tickets?`;

	return (
		<PeekListProvider rows={peekRows}>
			<div ref={root} className="flex min-h-0 flex-1 flex-col">
				{data.capped && <CapBanner onNarrow={focusFilter} />}
				<ColumnHeaderRow columns={columnIds} />
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
					onOpen={openPeek}
					onEditingChange={onEditingChange}
					onRowChange={onRowChange}
					onToggleGroup={collapsed.toggle}
					onCreateInGroup={openNew}
				/>
				<TableFooter total={total} selected={selection.count} sort={view.sort} />
				{selection.count > 0 && (
					<BulkBar
						count={selection.count}
						statuses={data.statuses}
						projects={projects}
						project={project}
						onStatus={(status) => void applyChange(selectedTickets(), { status })}
						onPriority={(priority) => void applyChange(selectedTickets(), { priority })}
						onProject={(ref) => void applyChange(selectedTickets(), { project: ref })}
						onParent={(parent) => void applyChange(selectedTickets(), { parent })}
						onCopyIds={() => void copyIds()}
						onDelete={() => setPendingDelete(selection.selected)}
					/>
				)}
				<ConfirmDialog
					open={pendingDelete !== null}
					title={deleteTitle}
					description="A deleted ticket is gone. Its sub-tickets lose their parent."
					confirmLabel="Delete"
					danger
					onConfirm={() => void confirmDelete()}
					onCancel={() => setPendingDelete(null)}
				/>
			</div>
			{children}
		</PeekListProvider>
	);
}
