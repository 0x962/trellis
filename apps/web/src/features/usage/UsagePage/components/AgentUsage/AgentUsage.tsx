import { useNavigate, useSearch } from "@tanstack/react-router";
import type { UsageDays, UsageMetric } from "@trellis/api";
import {
	Button,
	Chip,
	EmptyState,
	FailureState,
	GroupHeader,
	Pagination,
	Panel,
	SectionHeader,
	Select,
	Skeleton,
	UsageChart,
} from "@trellis/ui";
import { useId, useMemo, useState } from "react";
import { formatDayLabel, formatMetric } from "../../../formatUsage";
import { useUsageReport } from "../../hooks/useUsageReport";
import { UsageAccounts } from "../UsageAccounts";
import { UsageGroups } from "../UsageGroups";
import { UsageProviders } from "../UsageProviders";
import { UsageTotals } from "../UsageTotals";
import { MergedWork } from "./components/MergedWork";
import { useUsageRanking } from "./components/useUsageRanking";
import { usageChartSeries } from "./usageChartSeries";

const metricOptions = [
	{ value: "usd", label: "Cost" },
	{ value: "tokens", label: "Tokens" },
] as const;
const rangeOptions = [
	{ value: "7", label: "Last 7 days" },
	{ value: "30", label: "Last 30 days" },
	{ value: "90", label: "Last 90 days" },
] as const;

export function AgentUsage() {
	const [explanationOpen, setExplanationOpen] = useState(false);
	const explanationId = useId();
	const search = useSearch({ from: "/usage" });
	const navigate = useNavigate({ from: "/usage" });
	const { days, setDays, report } = useUsageReport();
	const metric: UsageMetric = search.metric ?? "usd";
	const group = search.group === "harness" ? "harness" : "model";
	const selectedRow = search.row ?? null;
	const selectedDay = search.day ?? null;
	const setSearch = (patch: Partial<typeof search>) =>
		void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
	const clearRow = () => setSearch({ row: undefined });
	const models = useUsageRanking(report.data, "model", metric, group === "model" ? selectedRow : null, null, clearRow);
	const harnesses = useUsageRanking(
		report.data,
		"harness",
		metric,
		group === "harness" ? selectedRow : null,
		null,
		clearRow,
	);
	const selected = (group === "model" ? models : harnesses).data?.selected ?? null;
	const buckets = report.data?.buckets;
	const chartDays = useMemo(() => buckets?.map((bucket) => bucket.day) ?? [], [buckets]);
	const dayTotals = useMemo(() => buckets?.map((bucket) => bucket[metric]) ?? [], [buckets, metric]);
	const series = useMemo(
		() => usageChartSeries(chartDays, dayTotals, selected, metric),
		[chartDays, dayTotals, selected, metric],
	);
	const metricLabel = metric === "usd" ? "API-rate cost" : "Tokens";
	const title = `${selected?.label ?? metricLabel} per day`;
	const rankingError = models.error ?? harnesses.error;
	const pending = report.isPending || (report.isSuccess && (models.isPending || harnesses.isPending));

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h2 className="text-2xl font-semibold tracking-tight text-fg">Usage overview</h2>
					<p className="mt-2 text-sm text-fg-muted">
						{chartDays.length > 0
							? `${formatDayLabel(chartDays[0]!)}–${formatDayLabel(chartDays.at(-1)!)} · ${new Date(report.data!.computedAt).getFullYear()}`
							: `Last ${days} days`}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Select
						label="Date range"
						items={rangeOptions}
						value={String(days) as "7" | "30" | "90"}
						onValueChange={(value) => setDays(Number(value) as UsageDays)}
					/>
					<Select
						label="Metric"
						items={metricOptions}
						value={metric}
						onValueChange={(value) => setSearch({ metric: value })}
					/>
				</div>
			</div>
			{report.data && (
				<p role="status" className="text-xs text-fg-muted">
					Saved {new Date(report.data.computedAt).toLocaleString()}. Select Refresh usage to update the report.
					{report.isFetching && " The selected report is loading."}
				</p>
			)}
			{pending ? (
				<div role="status" aria-label="Load usage" className="flex flex-col gap-6">
					<Skeleton height="h-96" />
					<Skeleton height="h-64" />
				</div>
			) : report.isError || rankingError ? (
				<FailureState
					title="Could not read the usage history"
					detail={report.error?.message ?? rankingError?.message}
					action={
						<Button
							size="md"
							processing={report.isFetching || models.isFetching || harnesses.isFetching}
							onClick={() => {
								void report.refetch();
								void models.refetch();
								void harnesses.refetch();
							}}
						>
							Try again
						</Button>
					}
				/>
			) : report.data.totals.sessions === 0 ? (
				<EmptyState
					title={`No usage in the last ${report.data.days} days`}
					description="Select a longer range, or select Refresh usage to read the transcripts again."
				/>
			) : (
				<>
					<Panel aria-label="Usage totals and daily chart">
						<UsageTotals totals={report.data.totals} />
						<div className="flex flex-col gap-6 border-t border-border px-7 pt-6 pb-4 max-sm:px-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<SectionHeader title={title} level={3} appearance="overview" />
								{selected && (
									<Chip
										label={group === "model" ? "Model" : "Harness"}
										value={selected.label}
										onRemove={clearRow}
										removeLabel="Clear usage filter"
									/>
								)}
							</div>
							<UsageChart
								label={title}
								days={chartDays}
								series={series}
								format={(value) => formatMetric(metric, value)}
								formatDay={formatDayLabel}
								selectedDay={selectedDay}
								onSelectDay={(day) => setSearch({ day: day ?? undefined })}
								appearance="overview"
							/>
						</div>
					</Panel>
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						{(
							[
								["model", models],
								["harness", harnesses],
							] as const
						).map(([kind, query]) => (
							<UsageGroups
								key={kind}
								group={kind}
								rows={query.data?.groups ?? []}
								metric={metric}
								total={report.data.totals[metric]}
								maxValue={query.data?.maxValue ?? 0}
								count={query.data?.groupTotal ?? 0}
								selectedRow={group === kind ? selectedRow : null}
								onSelectRow={(row) => setSearch({ group: kind, row: row ?? undefined })}
								pages={
									<Pagination
										label={kind === "model" ? "models" : "harnesses"}
										start={query.data?.groupStart ?? 0}
										count={query.data?.groups.length ?? 0}
										total={query.data?.groupTotal ?? 0}
										pending={query.isFetching}
										onPage={query.changeGroupPage}
									/>
								}
							/>
						))}
					</div>
					<p className="-mt-2 text-xs text-fg-muted">Select a model or harness to filter the daily chart.</p>
				</>
			)}
			{report.data && <MergedWork report={report.data} />}
			{report.data && (
				<div className="border-t border-border pt-4 text-xs text-fg-muted">
					<GroupHeader
						group="usage-explanation"
						label="How to read these charts"
						appearance="strip"
						expanded={explanationOpen}
						onToggle={() => setExplanationOpen((value) => !value)}
						controls={explanationId}
					/>
					<div id={explanationId} hidden={!explanationOpen}>
						<div className="mt-2 flex max-w-prose flex-col gap-2">
							<p>
								API-rate cost uses API list prices from {report.data.pricingTableUpdated}. It is not a subscription
								bill. A ~ marks an approximate rate.
							</p>
							<p>
								Model and harness bars show the same usage in two ways. Their filters change only the daily usage chart.
							</p>
							<p>
								Merged work uses saved GitHub data. Each linked repository and PR number counts once, by merge date,
								through the report time.
							</p>
							<p>
								Line totals include all files. They measure changed lines, not productivity. Missing values are marked
								as incomplete.
							</p>
						</div>
					</div>
				</div>
			)}
			<section aria-label="Configuration" className="mt-4 flex flex-col gap-4 border-t border-border pt-6">
				<SectionHeader title="Configuration" />
				<UsageAccounts
					rows={report.data?.rankings[metric].groups.account ?? []}
					metric={metric}
					total={report.data?.totals[metric] ?? 0}
					pending={report.isPending}
				/>
				<UsageProviders />
			</section>
		</div>
	);
}
