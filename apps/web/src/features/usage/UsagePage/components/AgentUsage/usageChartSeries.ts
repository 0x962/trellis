import type { UsageGroupBy, UsageGroupRow, UsageMetric } from "@trellis/api";
import type { UsageChartSeries } from "@trellis/ui";
import { rowTone } from "../../../formatUsage";

export function usageChartSeries(
	days: readonly string[],
	dayTotals: readonly number[],
	rows: readonly UsageGroupRow[],
	selected: UsageGroupRow | null,
	metric: UsageMetric,
	group: UsageGroupBy,
	selectedRank = selected === null ? -1 : rows.indexOf(selected),
): UsageChartSeries[] {
	if (selected === null) return [{ key: "total", label: "All usage", tone: "agent", values: dayTotals }];
	const valuesByDay = new Map(selected.days.map((slice) => [slice.day, slice[metric]]));
	return [
		{
			key: selected.key,
			label: selected.label,
			tone: rowTone(selected, selectedRank, group),
			values: days.map((day) => valuesByDay.get(day) ?? 0),
		},
	];
}
