import type { ListQueryInput, Status, StatusCategory } from "@trellis/api";
import { toListQuery, type View } from "../../../filters/grammar";

// The active pass loads every open ticket in pages of this size, up to the
// cap. The cap keeps the client-side grouping under a bound; a banner
// above the rows says the list is cut.
export const pageSize = 200;
export const rowCap = 2000;
// A closed group loads on expand, one page at a time.
export const closedPageSize = 50;

export const activeCategories: readonly StatusCategory[] = ["todo", "started", "review"];

// True when the URL names the statuses the table shows. The closed groups
// then have no place.
export const hasStatusFilter = (view: View) => view.status !== undefined || view.category !== undefined;

// The list filters of a route: the project of the route, then the URL.
export const scopedQuery = (project: string | undefined, view: View, statuses: readonly Status[]): ListQueryInput => {
	const query = toListQuery(view, { statuses });
	return project === undefined ? query : { project, ...query };
};

// The first pass: the open categories in full, unless the URL already
// narrows the statuses.
export const activeInput = (project: string | undefined, view: View, statuses: readonly Status[]): ListQueryInput => {
	const query = scopedQuery(project, view, statuses);
	return hasStatusFilter(view)
		? { ...query, limit: pageSize }
		: { ...query, category: [...activeCategories], limit: pageSize };
};

// The slugs of a closed category, once each. /all folds several roots.
export const closedSlugs = (statuses: readonly Status[], category: StatusCategory) => [
	...new Set(statuses.filter((status) => status.category === category).map((status) => status.slug)),
];

// The page query of one closed group: the same filters, that category's
// statuses, and the group's own page size.
export const closedInput = (
	project: string | undefined,
	view: View,
	statuses: readonly Status[],
	category: StatusCategory,
): ListQueryInput => {
	const { category: _category, ...query } = scopedQuery(project, view, statuses);
	return { ...query, status: closedSlugs(statuses, category), limit: closedPageSize };
};

// True when the table draws the Done and Canceled rows inside the groups of
// the view, not in groups of their own: the milestone and the turn grouping
// of one epic. A finished milestone then keeps its group, an open milestone
// shows its done rows, and the turn grouping fills its Done group. One epic
// bounds the row count; a milestone grouping over every epic of a project
// keeps the open rows alone.
export const hasInlineClosed = (view: View) =>
	(view.group === "milestone" || view.group === "turn") &&
	view.epic !== undefined &&
	view.epic !== "none" &&
	view.closed !== "hide" &&
	!hasStatusFilter(view);

// The page query of the inline closed rows: the same filters, and the
// statuses of the two closed categories.
export const inlineClosedInput = (
	project: string | undefined,
	view: View,
	statuses: readonly Status[],
): ListQueryInput => {
	const { category: _category, ...query } = scopedQuery(project, view, statuses);
	return {
		...query,
		status: [...closedSlugs(statuses, "done"), ...closedSlugs(statuses, "canceled")],
		limit: pageSize,
	};
};
