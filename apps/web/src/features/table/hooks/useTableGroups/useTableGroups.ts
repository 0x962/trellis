import type { Status, StatusCategory, TicketSummary } from "@trellis/api";
import { useMemo } from "react";
import type { View } from "../../../filters/grammar";
import { useEpicMilestonesLoad } from "../../../pickers/hooks/useEpicMilestones";
import type { TableGroup } from "../../utils/flattenGroups";
import { groupRows } from "../../utils/groupRows";
import { closedSlugs } from "../../utils/listQuery";
import { milestoneMarks } from "../../utils/milestoneGroups";
import type { ClosedCategory, TableData } from "../useTableData";

export type TableGroupsOptions = {
	data: TableData;
	view: View;
	project?: string;
	isCollapsed: (key: string) => boolean;
};

export type TableGroups = {
	groups: TableGroup[];
	loading: boolean;
};

export const closedCategories: readonly ClosedCategory[] = ["done", "canceled"];

// The group key of a closed category: the slug its first status carries.
export const closedKey = (statuses: readonly Status[], category: StatusCategory) => closedSlugs(statuses, category)[0];

// The refs of the epics the rows belong to, in epic name order. Names
// compare in lower case, as in the epic grouping. Epic names are not
// unique, so two epics with one name take the order of their refs.
const epicRefsOf = (rows: readonly TicketSummary[]) => {
	const names = new Map<string, string>();
	for (const row of rows) {
		if (row.epic !== null) names.set(row.epic.ref, row.epic.name.toLowerCase());
	}
	const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
	return [...names.keys()].sort((a, b) => order(names.get(a)!, names.get(b)!) || order(a, b));
};

const noRefs: string[] = [];

// The groups the table renders: the rows grouped by the view, then, under
// the status grouping, one group per closed category with the server's count
// and its own pages. Under the milestone grouping the groups follow the
// milestone positions of each epic in view. A view that names one epic also
// holds the Done and Canceled rows of that epic (see `hasInlineClosed`), so
// a finished milestone keeps its group. When every row belongs to one epic,
// each milestone header prints the done and total counts of the milestone
// from the server, and the Current badge or the word Later. A new ticket
// from such a header joins the epic and the milestone.
// `loading` is true until the milestones of every epic in view have
// landed, because the group order and the header marks come from them; the
// table draws its skeleton for that time, so the groups never change order
// on screen.
export const useTableGroups = ({ data, view, project, isCollapsed }: TableGroupsOptions): TableGroups => {
	const { rows: activeRows, statuses, closed, inlineClosed } = data;
	// A live patch can close a row of the active pass while the closed pass
	// already holds it, so the closed pass gives way on a shared id.
	const rows = useMemo(() => {
		if (inlineClosed === null) return activeRows;
		const activeIds = new Set(activeRows.map((row) => row.id));
		return [...activeRows, ...inlineClosed.filter((row) => !activeIds.has(row.id))];
	}, [activeRows, inlineClosed]);
	const epicRefs = useMemo(() => (view.group === "milestone" ? epicRefsOf(rows) : noRefs), [view.group, rows]);
	const { epics, pending } = useEpicMilestonesLoad(epicRefs);
	const groups = useMemo(() => {
		const milestones = epics.flatMap((entry) => entry.milestones);
		const oneEpic = epicRefs.length === 1 && rows.every((row) => row.epic !== null);
		const marks = oneEpic ? milestoneMarks(milestones, epics[0]?.epic.currentMilestone?.id) : undefined;
		const active: TableGroup[] = groupRows(rows, {
			group: view.group,
			sort: view.sort,
			statuses,
			project,
			milestoneOrder: milestones.map((milestone) => milestone.id),
		}).map((group) => {
			const mark = marks?.get(group.key);
			return {
				...group,
				count: group.rows.length,
				countLabel: mark?.countLabel,
				badge: mark?.badge,
				note: mark?.note,
				epicRef: oneEpic && view.group === "milestone" ? epicRefs[0] : undefined,
				expanded: view.group === "none" || !isCollapsed(group.key),
			};
		});
		if (closed === null || view.group !== "status" || view.closed === "hide") return active;
		const tail: TableGroup[] = [];
		for (const category of closedCategories) {
			const key = closedKey(statuses, category);
			const status = statuses.find((entry) => entry.category === category);
			const entry = closed[category];
			if (key === undefined || status === undefined) continue;
			const movedRows = active.filter((group) => group.category === category).flatMap((group) => group.rows);
			if (entry.count === 0 && entry.rows.length === 0 && movedRows.length === 0) continue;
			tail.push({
				key,
				label: status.name,
				rows: [...movedRows, ...entry.rows],
				status,
				category,
				count: entry.count + movedRows.length,
				expanded: !isCollapsed(key),
				hasMore: entry.hasMore,
				loadMore: entry.loadMore,
				loading: entry.loading,
			});
		}
		return [...active.filter((group) => !closedCategories.includes(group.category as ClosedCategory)), ...tail];
	}, [rows, statuses, closed, view.group, view.closed, view.sort, project, isCollapsed, epics, epicRefs]);
	return { groups, loading: pending };
};
