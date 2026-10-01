import type { UsageGroupRow, UsageMetric } from "@trellis/api";
import type { UsageChartSeries } from "@trellis/ui";

export function usageChartSeries(
	days: readonly string[],
	dayTotals: readonly number[],
	selected: UsageGroupRow | null,
	metric: UsageMetric,
): UsageChartSeries[] {
	if (selected === null) return [{ key: "total", label: "All usage", tone: "usage", values: dayTotals }];
	const valuesByDay = new Map(selected.days.map((slice) => [slice.day, slice[metric]]));
	return [
		{ key: selected.key, label: selected.label, tone: "usage", values: days.map((day) => valuesByDay.get(day) ?? 0) },
	];
}
