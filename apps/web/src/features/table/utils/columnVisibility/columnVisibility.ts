import type { TicketSummary } from "@trellis/api";
import { type ColumnId, columnOrder, hiddenByDefault } from "../../columns";

// The kind of table a route draws. An epic is a plan, so its table is the
// only one that carries the dependency edges between the tickets.
export type TableRoute = "epic" | "list";

// The columns one kind of route owns. A route of another kind hides such a
// column, and the Display popover of that route does not offer it.
const routeColumns: Partial<Record<ColumnId, TableRoute>> = { waits: "epic", releases: "epic" };

// True when this route draws this column at all.
export const routeShows = (id: ColumnId, route: TableRoute) => (routeColumns[id] ?? route) === route;

// The visibility of every column on a route: the defaults, then the
// stored choices, then the columns the route owns. The project column
// shows when the scope holds sub-projects.
export const columnVisibility = (
	stored: Record<string, boolean> | undefined,
	showProject: boolean,
	route: TableRoute,
): Record<ColumnId, boolean> => {
	const visibility = {} as Record<ColumnId, boolean>;
	for (const id of columnOrder) visibility[id] = !hiddenByDefault.includes(id);
	visibility.project = showProject;
	const chosen = { ...visibility, ...stored, select: true, title: true };
	for (const id of columnOrder) if (!routeShows(id, route)) chosen[id] = false;
	return chosen;
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
// epic column repeats an epic grouping, a milestone column repeats a
// milestone grouping, and a PR column with no PR in view is empty. A labels column is empty until one loaded row holds a label. A
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
		milestone: visibility.milestone && group !== "milestone",
		pr: visibility.pr && rows.some((row) => row.pr !== null),
		labels: visibility.labels && rows.some((row) => row.labels.length > 0),
	};
};

export const visibleColumns = (visibility: Record<string, boolean>): ColumnId[] =>
	columnOrder.filter((id) => visibility[id] !== false);
