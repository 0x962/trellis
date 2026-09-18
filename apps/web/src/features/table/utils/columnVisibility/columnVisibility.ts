import type { TicketSummary } from "@trellis/api";
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

export type AutoHideContext = {
	// The grouping of the view: "status", "project", "none", and so on.
	group: string;
	// The loaded rows of the view.
	rows: readonly TicketSummary[];
};

// Hides the columns that repeat what every row already shows. The result
// wins over a stored choice: a status column repeats a status grouping, a
// project column repeats a project grouping or a view of one project, an
// epic column repeats an epic grouping, and a PR column with no PR in view
// is empty. A labels column is empty until one loaded row holds a label. A
// column the person hid stays hidden.
export const autoHide = (
	visibility: Record<ColumnId, boolean>,
	{ group, rows }: AutoHideContext,
): Record<ColumnId, boolean> => {
	const first = rows[0]?.project.id;
	const oneProject = first !== undefined && rows.every((row) => row.project.id === first);
	return {
		...visibility,
		status: visibility.status && group !== "status",
		project: visibility.project && group !== "project" && !oneProject,
		epic: visibility.epic && group !== "epic",
		pr: visibility.pr && rows.some((row) => row.pr !== null),
		labels: visibility.labels && rows.some((row) => row.labels.length > 0),
	};
};

export const visibleColumns = (visibility: Record<string, boolean>): ColumnId[] =>
	columnOrder.filter((id) => visibility[id] !== false);
