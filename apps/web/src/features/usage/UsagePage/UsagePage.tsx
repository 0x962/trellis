import { ArrowClockwise } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { UsageDays, UsageGroupBy, UsageGroupRow, UsageMetric } from "@trellis/api";
import {
	Button,
	EmptyState,
	IconButton,
	otherTone,
	SectionHeader,
	Segmented,
	Skeleton,
	Tooltip,
	UsageChart,
	type UsageChartSeries,
} from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { CHART_TOP_ROWS, formatDayLabel, formatMetric, localDayKey, rowTone } from "../formatUsage";
import { UsageGroups } from "./components/UsageGroups";
import { UsageQuota } from "./components/UsageQuota";
import { UsageSessions } from "./components/UsageSessions";
import { UsageTotals } from "./components/UsageTotals";

const rangeOptions = [
	{ value: "7", label: "7d" },
	{ value: "30", label: "30d" },
	{ value: "90", label: "90d" },
] as const;

const metricOptions = [
	{ value: "usd", label: "Cost" },
	{ value: "tokens", label: "Tokens" },
] as const;

export const groupLabel: Record<UsageGroupBy, string> = {
	ticket: "ticket",
	persona: "persona",
	project: "project",
	kind: "agent kind",
	account: "account",
	model: "model",
	harness: "harness",
};

// The day series of the chart. A selected row is one series. Otherwise the
// top rows of the grouping are one series each, and the rest of the range
// folds into "Other", so the stack of a day is the day total.
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

// What every agent on this machine consumed: the subscription quota of each
// account, then the cost of the range from the transcripts, sliced by
// ticket, persona, project, agent kind, account, model, or harness. The
// grouping drives the chart, the ranked list, and the session list. A
// selected row narrows all three to that slice.
export function UsagePage() {
	const { orpc, client, queryClient } = useApp();
	const search = useSearch({ from: "/usage" });
	const navigate = useNavigate({ from: "/usage" });
	const days: UsageDays = search.days ?? 30;
	const metric: UsageMetric = search.metric ?? "usd";
	const group: UsageGroupBy = search.group ?? "ticket";
	const selectedRow = search.row ?? null;
	const selectedDay = search.day ?? null;
	const setSearch = (patch: Partial<typeof search>) =>
		void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });

	const report = useQuery({ ...orpc.usage.report.queryOptions({ input: { days } }), staleTime: 60_000 });
	const refresh = useMutation({
		mutationFn: () => client.usage.report({ days, refresh: true }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.usage.report.key() }),
	});
	const rows = report.data?.groups[group] ?? [];
	const row = selectedRow === null ? null : (rows.find((candidate) => candidate.key === selectedRow) ?? null);
	const chartDays = report.data?.buckets.map((bucket) => bucket.day) ?? [];
	const dayTotals = report.data?.buckets.map((bucket) => bucket[metric]) ?? [];
	const series = chartSeries(chartDays, dayTotals, rows, row, metric, group);

	return (
		<>
			<Topbar
				actions={
					<>
						<Segmented
							label="Range"
							options={rangeOptions}
							value={String(days) as "7" | "30" | "90"}
							onValueChange={(value) => setSearch({ days: Number(value) as UsageDays, row: undefined, day: undefined })}
						/>
						<Tooltip content="Scan the transcripts again">
							<IconButton
								label="Refresh usage"
								icon={<ArrowClockwise />}
								disabled={refresh.isPending || report.isFetching}
								onClick={() => refresh.mutate()}
							/>
						</Tooltip>
					</>
				}
			>
				<PageTitle title="Usage" />
			</Topbar>
			<div className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
				<div className="flex max-w-7xl flex-col gap-8">
					<UsageQuota />
					{report.isPending ? (
						<div role="status" aria-label="Load usage" className="flex flex-col gap-3">
							<span className="sr-only">Load usage</span>
							<Skeleton className="h-48 w-full" />
							<Skeleton className="h-24 w-full" />
						</div>
					) : report.isError ? (
						<div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-border p-4">
							<p className="text-sm text-danger">Could not read the usage history. {report.error.message}</p>
							<Button disabled={report.isFetching} onClick={() => void report.refetch()}>
								Retry
							</Button>
						</div>
					) : report.data.totals.sessions === 0 ? (
						<EmptyState
							title="No usage in this range"
							description={`No Claude Code, Codex, Pi, or OpenCode transcript on this machine has a turn in the last ${days} days.`}
						/>
					) : (
						<>
							<UsageTotals totals={report.data.totals} pricingTableUpdated={report.data.pricingTableUpdated} />
							<section aria-label="Per day" className="flex flex-col gap-4">
								<SectionHeader
									title={
										row
											? `${row.label} per day`
											: `${metric === "usd" ? "Cost" : "Tokens"} per day by ${groupLabel[group]}`
									}
									count={formatMetric(metric, row ? row[metric] : report.data.totals[metric])}
									actions={
										<Segmented
											label="Metric"
											options={metricOptions}
											value={metric}
											onValueChange={(value) => setSearch({ metric: value })}
										/>
									}
								/>
								<UsageChart
									label={
										row
											? `${row.label} per day`
											: `${metric === "usd" ? "Cost" : "Tokens"} per day by ${groupLabel[group]}`
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
								sessions={report.data.sessions.filter(
									(session) =>
										(selectedRow === null || session.groupKeys[group] === selectedRow) &&
										(selectedDay === null ||
											(localDayKey(session.firstAt) <= selectedDay && selectedDay <= localDayKey(session.lastAt))),
								)}
								metric={metric}
								filtered={row?.label ?? null}
							/>
						</>
					)}
				</div>
			</div>
		</>
	);
}
