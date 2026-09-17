import { ArrowSquareOut } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { UsageGroupBy, UsageGroupRow, UsageMetric } from "@trellis/api";
import { IconButton, ProviderIcon, RankedBars, SectionHeader, Segmented, Tooltip } from "@trellis/ui";
import { formatMetric, harnessProvider, modelProvider, rowTone } from "../../../formatUsage";

const groupOptions = [
	{ value: "ticket", label: "Ticket" },
	{ value: "agent", label: "Agent" },
	{ value: "project", label: "Project" },
	{ value: "kind", label: "Kind" },
	{ value: "account", label: "Account" },
	{ value: "model", label: "Model" },
	{ value: "harness", label: "Harness" },
] as const;

export type UsageGroupsProps = {
	group: UsageGroupBy;
	rows: readonly UsageGroupRow[];
	metric: UsageMetric;
	total: number;
	// The days of the range, for the sparkline of each row.
	days: readonly string[];
	selectedRow: string | null;
	onGroupChange: (group: UsageGroupBy) => void;
	onSelectRow: (key: string | null) => void;
};

// The link at the end of a row: a ticket row opens the ticket, a project
// row opens the board.
function RowLink({ row }: { row: UsageGroupRow }) {
	if (row.href?.startsWith("/t/")) {
		const identifier = row.href.slice(3);
		return (
			<Tooltip content={`Open ${identifier}`}>
				<IconButton
					label={`Open ${identifier}`}
					icon={<ArrowSquareOut />}
					render={<Link to="/t/$identifier" params={{ identifier }} />}
				/>
			</Tooltip>
		);
	}
	if (row.href?.startsWith("/p/")) {
		return (
			<Tooltip content={`Open ${row.label}`}>
				<IconButton
					label={`Open ${row.label}`}
					icon={<ArrowSquareOut />}
					render={<Link to="/p/$" params={{ _splat: row.href.slice(3) }} />}
				/>
			</Tooltip>
		);
	}
	return null;
}

// The company mark of a model or harness row.
function rowIcon(group: UsageGroupBy, row: UsageGroupRow) {
	const provider =
		group === "model"
			? modelProvider(row.label)
			: group === "harness" && row.harness
				? harnessProvider[row.harness]
				: null;
	return provider ? <ProviderIcon provider={provider} /> : undefined;
}

// The range sliced one way at a time, as ranked bars. The bar of a row is
// its share of the largest row, the sparkline is its days, and a pressed
// row is the selected slice that the chart and the session list follow.
export function UsageGroups({
	group,
	rows,
	metric,
	total,
	days,
	selectedRow,
	onGroupChange,
	onSelectRow,
}: UsageGroupsProps) {
	return (
		<section aria-label="Breakdown" className="flex flex-col gap-3">
			<SectionHeader
				title="Breakdown"
				count={rows.length}
				actions={<Segmented label="Group by" options={groupOptions} value={group} onValueChange={onGroupChange} />}
			/>
			<RankedBars
				label={`By ${groupOptions.find((option) => option.value === group)?.label.toLowerCase()}`}
				rows={rows.map((row, rank) => ({
					key: row.key,
					label: row.label,
					icon: rowIcon(group, row),
					detail: row.detail ?? undefined,
					value: row[metric],
					valueLabel: `${row.approximate && metric === "usd" ? "~" : ""}${formatMetric(metric, row[metric])}`,
					share: total > 0 ? row[metric] / total : 0,
					tone: rowTone(row, rank, group),
					spark: days.map((day) => row.days.find((slice) => slice.day === day)?.[metric] ?? 0),
					action: <RowLink row={row} />,
				}))}
				selected={selectedRow}
				onSelect={onSelectRow}
			/>
		</section>
	);
}
