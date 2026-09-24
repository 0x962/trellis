import { useTable } from "@tanstack/react-table";
import type { TicketSummary } from "@trellis/api";
import { useMemo } from "react";
import { uiActions, useUiStore } from "../../../../stores/uiStore";
import { buildColumns, type ColumnId, type TableKind, tableFeatureSet } from "../../columns";
import { autoHide, columnVisibility } from "../../utils/columnVisibility";

export type VisibleColumnsOptions = {
	// The pathname, which keys the stored preferences.
	routeKey: string;
	tableKind: TableKind;
	// True on a table over every project.
	showProject: boolean;
	// How the rows are grouped. A table grouped by a field hides the column
	// of that field.
	group: string;
	// The loaded rows. A column whose rows all hold the same value hides.
	rows: readonly TicketSummary[];
};

const columns = buildColumns();
const noTickets: TicketSummary[] = [];

// The columns the table draws, in order. The table instance holds no row:
// the virtual body draws the rows, and this reads the column list and writes
// each show and hide back to the stored preferences of the route.
export function useVisibleColumns({
	routeKey,
	tableKind,
	showProject,
	group,
	rows,
}: VisibleColumnsOptions): ColumnId[] {
	const stored = useUiStore((state) => state.columnVisibility[routeKey]);
	const visibility = useMemo(
		() => autoHide(columnVisibility(stored, showProject, tableKind), { group, rows }),
		[stored, showProject, tableKind, group, rows],
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
	// A new array here redraws every row of the table, because `Row` is
	// memoized and takes this list.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the visible set follows `visibility`; the table instance is stable
	return useMemo(() => table.getVisibleLeafColumns().map((column) => column.id as ColumnId), [visibility]);
}
