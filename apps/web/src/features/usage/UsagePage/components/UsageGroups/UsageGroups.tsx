import type { UsageGroupBy, UsageGroupRow, UsageMetric } from "@trellis/api";
import { RankedBars } from "@trellis/ui";
import type { ReactNode } from "react";
import { formatMetric } from "../../../formatUsage";

export type UsageGroupsProps = {
	group: UsageGroupBy;
	rows: readonly UsageGroupRow[];
	metric: UsageMetric;
	total: number;
	maxValue: number;
	count: number;
	pages: ReactNode;
	selectedRow: string | null;
	onSelectRow: (key: string | null) => void;
};

export function UsageGroups({
	group,
	rows,
	metric,
	total,
	maxValue,
	count,
	pages,
	selectedRow,
	onSelectRow,
}: UsageGroupsProps) {
	return (
		<section
			aria-label={`Breakdown by ${group}`}
			className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-usage-panel px-6 pt-5 pb-4 max-sm:px-4"
		>
			<div className="flex items-center justify-between gap-3">
				<h3 className="text-md font-medium text-fg">Breakdown by {group}</h3>
				<span className="text-xs text-fg-muted">
					{count} {count === 1 ? group : group === "model" ? "models" : "harnesses"}
				</span>
			</div>
			<RankedBars
				label={`By ${group}`}
				appearance="overview"
				rows={rows.map((row) => ({
					key: row.key,
					label: row.label,
					value: row[metric],
					valueLabel: `${row.approximate && metric === "usd" ? "~" : ""}${formatMetric(metric, row[metric])}`,
					share: total > 0 ? row[metric] / total : 0,
					tone: "usage",
				}))}
				maxValue={maxValue}
				selected={selectedRow}
				onSelect={onSelectRow}
			/>
			{pages}
		</section>
	);
}
