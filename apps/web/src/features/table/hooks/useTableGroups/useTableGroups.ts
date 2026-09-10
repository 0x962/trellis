import type { Status, StatusCategory } from "@trellis/api";
import { useMemo } from "react";
import type { View } from "../../../filters/grammar";
import type { TableGroup } from "../../utils/flattenGroups";
import { groupRows } from "../../utils/groupRows";
import { closedSlugs } from "../../utils/listQuery";
import type { ClosedCategory, TableData } from "../useTableData";

export type TableGroupsOptions = {
	data: TableData;
	view: View;
	project?: string;
	isCollapsed: (key: string) => boolean;
};

export const closedCategories: readonly ClosedCategory[] = ["done", "canceled"];

// The group key of a closed category: the slug its first status carries.
export const closedKey = (statuses: readonly Status[], category: StatusCategory) => closedSlugs(statuses, category)[0];

// The groups the table renders: the active rows grouped by the view, then,
// under the status grouping, one group per closed category with the
// server's count and its own pages.
export const useTableGroups = ({ data, view, project, isCollapsed }: TableGroupsOptions): TableGroup[] => {
	const { rows, statuses, closed } = data;
	return useMemo(() => {
		const active: TableGroup[] = groupRows(rows, { group: view.group, sort: view.sort, statuses, project }).map(
			(group) => ({ ...group, count: group.rows.length, expanded: view.group === "none" || !isCollapsed(group.key) }),
		);
		if (closed === null || view.group !== "status") return active;
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
	}, [rows, statuses, closed, view.group, view.sort, project, isCollapsed]);
};
