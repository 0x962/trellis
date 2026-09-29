import { useNavigate, useSearch } from "@tanstack/react-router";
import type { UsageGroupBy, UsageMetric } from "@trellis/api";
import {
	Button,
	Chip,
	EmptyState,
	FailureState,
	FilterBar,
	SectionHeader,
	Select,
	Skeleton,
	UsageChart,
} from "@trellis/ui";
import { formatDayLabel, formatMetric, localDayKey } from "../../../formatUsage";
import { useUsageReport } from "../../hooks/useUsageReport";
import { UsageAccounts } from "../UsageAccounts";
import { UsageGroups } from "../UsageGroups";
import { UsageProviders } from "../UsageProviders";
import { UsageSessions } from "../UsageSessions";
import { UsageTotals } from "../UsageTotals";
import { usageChartSeries } from "./usageChartSeries";

const metricOptions = [
	{ value: "usd", label: "Cost" },
	{ value: "tokens", label: "Tokens" },
] as const;

const groupOptions = [
	{ value: "ticket", label: "Ticket" },
	{ value: "agent", label: "Agent" },
	{ value: "project", label: "Project" },
	{ value: "kind", label: "Kind" },
	{ value: "account", label: "Account" },
	{ value: "model", label: "Model" },
	{ value: "harness", label: "Harness" },
] as const;

const filterValue = (value: string) => (value.length > 22 ? `${value.slice(0, 22)}…` : value);

export const groupLabel: Record<UsageGroupBy, string> = {
	ticket: "ticket",
	agent: "agent",
	project: "project",
	kind: "agent kind",
	account: "account",
	model: "model",
	harness: "harness",
};

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
	const series = usageChartSeries(chartDays, dayTotals, rows, row, metric, group);
	const metricLabel = metricOptions.find((option) => option.value === metric)!.label;
	const selectedGroupLabel = groupOptions.find((option) => option.value === group)!.label;

	return (
		<div className="flex max-w-7xl flex-col gap-6">
			<div className="flex flex-wrap items-end gap-2">
				<div className="mr-auto min-w-0 max-sm:w-full">
					<h2 className="text-lg font-semibold text-fg">Agent usage</h2>
					<p className="text-xs text-fg-muted">Cost and token activity for the last {days} days.</p>
				</div>
				<FilterBar
					filters={
						(row !== null || selectedDay !== null) && (
							<div className="flex flex-wrap items-center gap-2">
								{row !== null && (
									<Chip
										label={selectedGroupLabel}
										value={filterValue(row.label)}
										onRemove={() => setSearch({ row: undefined })}
										removeLabel={`Remove ${selectedGroupLabel.toLowerCase()} filter for ${row.label}`}
									/>
								)}
								{selectedDay !== null && (
									<Chip
										label="Day"
										value={formatDayLabel(selectedDay)}
										onRemove={() => setSearch({ day: undefined })}
										removeLabel="Remove day filter"
									/>
								)}
							</div>
						)
					}
				>
					<Select
						label="Metric"
						items={metricOptions}
						value={metric}
						onValueChange={(value) => setSearch({ metric: value, row: undefined })}
					/>
					<Select
						label="Group by"
						items={groupOptions}
						value={group}
						onValueChange={(value) => setSearch({ group: value, row: undefined })}
					/>
				</FilterBar>
			</div>
			{report.isPending ? (
				<div role="status" aria-label="Load usage" className="flex flex-col gap-4">
					<span className="sr-only">Load usage</span>
					<Skeleton height="h-24" />
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.75fr)]">
						<Skeleton height="h-64" />
						<Skeleton height="h-64" />
					</div>
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
					<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.75fr)]">
						<section aria-label="Per day" className="flex min-w-0 flex-col gap-3">
							<SectionHeader
								title={row ? `${row.label} per day` : `${metricLabel} per day`}
								count={formatMetric(metric, row ? row[metric] : report.data.totals[metric])}
							/>
							<UsageChart
								label={row ? `${row.label} per day` : `${metricLabel} per day`}
								days={chartDays}
								series={series}
								format={(value) => formatMetric(metric, value)}
								formatDay={formatDayLabel}
								selectedDay={selectedDay}
								onSelectDay={(day) => setSearch({ day: day ?? undefined })}
								variant="line"
							/>
						</section>
						<UsageGroups
							group={group}
							rows={rows}
							metric={metric}
							total={report.data.totals[metric]}
							days={chartDays}
							selectedRow={selectedRow}
							onSelectRow={(key) => setSearch({ row: key ?? undefined })}
						/>
					</div>
					<UsageSessions
						sessions={(ranking?.sessions ?? []).filter(
							(session) =>
								(row === null || session.groupKeys[group] === row.key) &&
								(selectedDay === null ||
									(localDayKey(session.firstAt) <= selectedDay && selectedDay <= localDayKey(session.lastAt))),
						)}
						metric={metric}
						groupLabel={groupLabel[group]}
						filtered={row?.label ?? null}
					/>
				</>
			)}
			<section aria-label="Configuration" className="flex flex-col gap-4 border-t border-border pt-4">
				<SectionHeader title="Configuration" />
				<UsageAccounts
					rows={ranking?.groups.account ?? []}
					metric={metric}
					total={report.data?.totals[metric] ?? 0}
					pending={report.isPending}
				/>
				<UsageProviders />
			</section>
		</div>
	);
}
