import { useNavigate, useSearch } from "@tanstack/react-router";
import type { UsageGroupBy, UsageGroupRow, UsageMetric } from "@trellis/api";
import {
	Button,
	EmptyState,
	FailureState,
	otherTone,
	SectionHeader,
	Segmented,
	Skeleton,
	UsageChart,
	type UsageChartSeries,
} from "@trellis/ui";
import { CHART_TOP_ROWS, formatDayLabel, formatMetric, localDayKey, rowTone } from "../../../formatUsage";
import { useUsageReport } from "../../hooks/useUsageReport";
import { UsageAccounts } from "../UsageAccounts";
import { UsageGroups } from "../UsageGroups";
import { UsageSessions } from "../UsageSessions";
import { UsageTotals } from "../UsageTotals";

const metricOptions = [
	{ value: "usd", label: "Cost" },
	{ value: "tokens", label: "Tokens" },
] as const;

export const groupLabel: Record<UsageGroupBy, string> = {
	ticket: "ticket",
	agent: "agent",
	project: "project",
	kind: "agent kind",
	account: "account",
	model: "model",
	harness: "harness",
};

function chartSeries(
	days: readonly string[],
	dayTotals: readonly number[],
	rows: readonly UsageGroupRow[],
	selected: UsageGroupRow | null,
	metric: UsageMetric,
	group: UsageGroupBy,
): UsageChartSeries[] {
	const seriesOf = (row: UsageGroupRow, rank: number): UsageChartSeries => ({
		key: row.key,
		label: row.label,
		tone: rowTone(row, rank, group),
		values: days.map((day) => row.days.find((slice) => slice.day === day)?.[metric] ?? 0),
	});
	if (selected) return [seriesOf(selected, rows.indexOf(selected))];
	const top = rows.slice(0, CHART_TOP_ROWS).map(seriesOf);
	if (rows.length <= CHART_TOP_ROWS) return top;
	const other = days.map((_, index) =>
		Math.max(0, (dayTotals[index] ?? 0) - top.reduce((sum, series) => sum + (series.values[index] ?? 0), 0)),
	);
	return [...top, { key: "other", label: `Other (${rows.length - CHART_TOP_ROWS})`, tone: otherTone, values: other }];
}

export function AgentUsage() {
	const search = useSearch({ from: "/usage" });
	const navigate = useNavigate({ from: "/usage" });
	const { days, report } = useUsageReport();
	const metric: UsageMetric = search.metric ?? "usd";
	const group: UsageGroupBy = search.group ?? "ticket";
	const selectedRow = search.row ?? null;
	const selectedDay = search.day ?? null;
	const setSearch = (patch: Partial<typeof search>) =>
		void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });

	const ranking = report.data?.rankings[metric];
	const rows = ranking?.groups[group] ?? [];
	const row = selectedRow === null ? null : (rows.find((candidate) => candidate.key === selectedRow) ?? null);
	const chartDays = report.data?.buckets.map((bucket) => bucket.day) ?? [];
	const dayTotals = report.data?.buckets.map((bucket) => bucket[metric]) ?? [];
	const series = chartSeries(chartDays, dayTotals, rows, row, metric, group);

	return (
		<div className="flex max-w-7xl flex-col gap-8">
			<UsageAccounts
				rows={ranking?.groups.account ?? []}
				metric={metric}
				total={report.data?.totals[metric] ?? 0}
				pending={report.isPending}
			/>
			{report.isPending ? (
				<div role="status" aria-label="Load usage" className="flex flex-col gap-3">
					<span className="sr-only">Load usage</span>
					<Skeleton height="h-24" />
					<Skeleton height="h-48" />
					<Skeleton height="h-64" />
				</div>
			) : report.isError ? (
				<FailureState
					title="Could not read the usage history"
					detail={report.error.message}
					action={
						<Button size="md" processing={report.isFetching} onClick={() => void report.refetch()}>
							Try again
						</Button>
					}
				/>
			) : report.data.totals.sessions === 0 ? (
				<EmptyState
					title={`No usage in the last ${days} days`}
					description={
						days < 90
							? "Trellis found no agent transcript on this machine for this range. Select a longer range, or select Refresh usage."
							: "Trellis found no agent transcript on this machine for this range. Select Refresh usage to read the transcripts again."
					}
				/>
			) : (
				<>
					<UsageTotals totals={report.data.totals} pricingTableUpdated={report.data.pricingTableUpdated} />
					<section aria-label="Per day" className="flex flex-col gap-3">
						<SectionHeader
							title={
								row ? `${row.label} per day` : `${metric === "usd" ? "Cost" : "Tokens"} per day by ${groupLabel[group]}`
							}
							count={formatMetric(metric, row ? row[metric] : report.data.totals[metric])}
							actions={
								<Segmented
									label="Metric"
									options={metricOptions}
									value={metric}
									onValueChange={(value) => setSearch({ metric: value, row: undefined })}
								/>
							}
						/>
						<UsageChart
							label={
								row ? `${row.label} per day` : `${metric === "usd" ? "Cost" : "Tokens"} per day by ${groupLabel[group]}`
							}
							days={chartDays}
							series={series}
							format={(value) => formatMetric(metric, value)}
							formatDay={formatDayLabel}
							selectedDay={selectedDay}
							onSelectDay={(day) => setSearch({ day: day ?? undefined })}
						/>
					</section>
					<UsageGroups
						group={group}
						rows={rows}
						metric={metric}
						total={report.data.totals[metric]}
						days={chartDays}
						selectedRow={selectedRow}
						onGroupChange={(value) => setSearch({ group: value, row: undefined })}
						onSelectRow={(key) => setSearch({ row: key ?? undefined })}
					/>
					<UsageSessions
						sessions={(ranking?.sessions ?? []).filter(
							(session) =>
								(row === null || session.groupKeys[group] === row.key) &&
								(selectedDay === null ||
									(localDayKey(session.firstAt) <= selectedDay && selectedDay <= localDayKey(session.lastAt))),
						)}
						metric={metric}
						filtered={row?.label ?? null}
					/>
				</>
			)}
		</div>
	);
}
