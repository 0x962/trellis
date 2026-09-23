import type { Status, StatusCategory, TicketSummary } from "@trellis/api";
import { useMemo } from "react";
import type { View } from "../../../filters/grammar";
import { useEpicWavesLoad } from "../../../pickers/hooks/useEpicWaves";
import type { TableGroup } from "../../utils/flattenGroups";
import { groupRows, type RowRank } from "../../utils/groupRows";
import { closedSlugs } from "../../utils/listQuery";
import { forYouCount, type WorkingTicketIds } from "../../utils/waitingGroups";
import { waveMarks, withEmptyWaves } from "../../utils/waveGroups";
import type { ClosedCategory, TableData } from "../useTableData";

export type TableGroupsOptions = {
	data: TableData;
	view: View;
	project?: string;
	isCollapsed: (key: string) => boolean;
	// The rank of a row inside its group, ahead of the view's sort. The
	// groups rebuild when its identity changes, so the caller memoizes it.
	rowRank?: RowRank;
	// The epic route passes it; the Waiting grouping and the `1 for you`
	// count of a wave header read it. Null while the agent-run query of the
	// route has not answered: the Waiting grouping then reports `loading`,
	// because a row would land in the wrong group and move when the answer
	// arrives.
	// Memoize it: a new identity regroups the rows.
	workingTicketIds?: WorkingTicketIds | null;
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
// and its own pages. Under the wave grouping the groups follow the
// wave positions of each epic in view. A view that names one epic also
// holds the Done and Canceled rows of that epic (see `hasInlineClosed`), so
// a finished wave keeps its group. When every row belongs to one epic,
// each wave header prints the done and total counts of the wave from the server.
// A new ticket from such a header joins the epic and the wave.
// `loading` is true until the waves of every epic in view have
// landed, because the group order and the header counts come from them; the
// table draws its skeleton for that time, so the groups never change order
// on screen.
export const useTableGroups = ({
	data,
	view,
	project,
	isCollapsed,
	rowRank,
	workingTicketIds,
}: TableGroupsOptions): TableGroups => {
	const { rows: activeRows, statuses, closed, inlineClosed } = data;
	// A live patch can close a row of the active pass while the closed pass
	// already holds it, so the closed pass gives way on a shared id.
	const rows = useMemo(() => {
		if (inlineClosed === null) return activeRows;
		const activeIds = new Set(activeRows.map((row) => row.id));
		return [...activeRows, ...inlineClosed.filter((row) => !activeIds.has(row.id))];
	}, [activeRows, inlineClosed]);
	// A view that names one epic reads the waves of that epic even with no
	// row, so an epic whose waves hold no ticket still draws their headers.
	const fixedEpic = view.epic === undefined || view.epic === "none" ? undefined : view.epic;
	const epicRefs = useMemo(() => {
		if (view.group !== "wave") return noRefs;
		return fixedEpic === undefined ? epicRefsOf(rows) : [fixedEpic];
	}, [view.group, rows, fixedEpic]);
	const { epics, pending } = useEpicWavesLoad(epicRefs);
	const working = workingTicketIds ?? undefined;
	const groups = useMemo(() => {
		const waves = epics.flatMap((entry) => entry.waves);
		const oneEpic = epicRefs.length === 1 && rows.every((row) => row.epic !== null);
		const marks = oneEpic ? waveMarks(waves) : undefined;
		const grouped = groupRows(rows, {
			group: view.group,
			sort: view.sort,
			statuses,
			project,
			waveOrder: waves.map((wave) => wave.id),
			rowRank,
			workingTicketIds: working,
		});
		const active: TableGroup[] = (oneEpic && view.group === "wave" ? withEmptyWaves(grouped, waves) : grouped).map(
			(group) => {
				const mark = marks?.get(group.key);
				return {
					...group,
					count: group.rows.length,
					countLabel: mark?.countLabel,
					completedCount: mark?.completedCount,
					totalCount: mark?.totalCount,
					forYou: mark === undefined ? undefined : forYouCount(group.rows, working),
					done: mark?.done,
					epicRef: oneEpic && view.group === "wave" ? epicRefs[0] : undefined,
					expanded: view.group === "none" || !isCollapsed(group.key),
				};
			},
		);
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
	}, [
		rows,
		statuses,
		closed,
		view.group,
		view.closed,
		view.sort,
		project,
		isCollapsed,
		epics,
		epicRefs,
		rowRank,
		working,
	]);
	return { groups, loading: pending || (view.group === "waiting" && workingTicketIds === null) };
};
