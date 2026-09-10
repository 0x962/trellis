import { type ColumnId, columnOrder, hiddenByDefault } from "../../columns";

// The visibility of every column on a route: the defaults, then the
// stored choices. The project column shows when the scope holds
// sub-projects.
export const columnVisibility = (
	stored: Record<string, boolean> | undefined,
	showProject: boolean,
): Record<ColumnId, boolean> => {
	const visibility = {} as Record<ColumnId, boolean>;
	for (const id of columnOrder) visibility[id] = !hiddenByDefault.includes(id);
	visibility.project = showProject;
	return { ...visibility, ...stored, select: true, title: true };
};

export const visibleColumns = (visibility: Record<string, boolean>): ColumnId[] =>
	columnOrder.filter((id) => visibility[id] !== false);
