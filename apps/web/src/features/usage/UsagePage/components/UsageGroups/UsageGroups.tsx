import type { UsageGroupBy, UsageGroupRow, UsageMetric } from "@trellis/api";
import { Panel, RankedBars, SectionHeader } from "@trellis/ui";
import { type ReactNode, useMemo } from "react";
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
	const groupNames: Record<UsageGroupBy, [string, string]> = {
		ticket: ["ticket", "tickets"],
		agent: ["agent", "agents"],
		project: ["project", "projects"],
		kind: ["run kind", "run kinds"],
		account: ["account", "accounts"],
		model: ["model", "models"],
		harness: ["harness", "harnesses"],
	};
	const [name, plural] = groupNames[group];
	const rankedRows = useMemo(
		() =>
			rows.map((row) => ({
				key: row.key,
				label: row.label,
				detail: row.detail ?? undefined,
				value: row[metric],
				valueLabel: `${row.approximate && metric === "usd" ? "~" : ""}${formatMetric(metric, row[metric])}`,
				share: total > 0 ? row[metric] / total : 0,
				tone: "usage" as const,
			})),
		[rows, metric, total],
	);
	return (
		<Panel aria-label={`Breakdown by ${name}`} className="flex min-w-0 flex-col gap-4 px-6 pt-5 pb-4 max-sm:px-4">
			<SectionHeader
				title={`Breakdown by ${name}`}
				level={3}
				appearance="overview"
				actions={`${count} ${count === 1 ? name : plural}`}
			/>
			<RankedBars
				label={`By ${name}`}
				appearance="overview"
				rows={rankedRows}
				maxValue={maxValue}
				selected={selectedRow}
				onSelect={onSelectRow}
			/>
			{pages}
		</Panel>
	);
}
