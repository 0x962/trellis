import { useQuery } from "@tanstack/react-query";
import type { UsageReport } from "@trellis/api";
import {
	Button,
	Chip,
	EmptyState,
	FailureState,
	Panel,
	SectionHeader,
	Skeleton,
	StatTile,
	UsageChart,
	type UsageChartSeries,
} from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { formatDayLabel, formatTokens } from "../../../../../formatUsage";

const count = (value: number) => value.toLocaleString("en-US");
const missingDetail = (value: number) => `${count(value)} ${value === 1 ? "PR lacks" : "PRs lack"} this value`;
const coverage = (value: number) =>
	value === 0 ? "complete" : `unavailable for ${count(value)} ${value === 1 ? "PR" : "PRs"}`;
const lines = (value: number, missing: number, prs: number, sign: string) =>
	missing > 0 && missing === prs ? "Not available" : `${missing > 0 ? "≥ " : ""}${sign}${count(value)}`;

export function MergedWork({ report }: { report: UsageReport }) {
	const { orpc } = useApp();
	const query = useQuery({
		...orpc.usage.mergedWork.queryOptions({ input: { days: report.days, computedAt: report.computedAt } }),
		staleTime: 5 * 60_000,
	});
	const [comparison, setComparison] = useState<{ range: number; day: string | null }>({
		range: report.days,
		day: null,
	});
	const data = query.data;
	const selectedDay =
		comparison.range === report.days && data?.buckets.some((bucket) => bucket.day === comparison.day)
			? comparison.day
			: null;
	const selectDay = (day: string | null) => setComparison({ range: report.days, day });
	const selectedBucket = data?.buckets.find((bucket) => bucket.day === selectedDay);
	const { days, prs, changes } = useMemo(
		() => ({
			days: data?.buckets.map((bucket) => bucket.day) ?? [],
			prs: [
				{ key: "prs", label: "PRs merged", tone: "merged", values: data?.buckets.map((bucket) => bucket.prs) ?? [] },
			] satisfies UsageChartSeries[],
			changes: [
				{
					key: "added",
					label: "Known added",
					tone: "added",
					values: data?.buckets.map((bucket) => bucket.additions) ?? [],
				},
				{
					key: "deleted",
					label: "Known deleted",
					tone: "deleted",
					values: data?.buckets.map((bucket) => bucket.deletions) ?? [],
				},
			] satisfies UsageChartSeries[],
		}),
		[data],
	);
	return (
		<section aria-label="Merged work" className="mt-4 flex flex-col gap-5">
			<SectionHeader
				title="Merged work"
				level={3}
				appearance="prominent"
				description="Unique linked PRs across all projects, by local merge date. Usage row and date selections do not change these charts."
			/>
			{query.isPending ? (
				<Skeleton height="h-80" />
			) : query.isError ? (
				<FailureState
					title="Could not read merged work"
					detail={query.error.message}
					action={<Button onClick={() => void query.refetch()}>Try again</Button>}
				/>
			) : (
				data && (
					<Panel>
						<p className="px-7 pt-5 text-xs text-fg-muted max-sm:px-4">
							Totals cover the full {report.days}-day range.
						</p>
						<div className="grid grid-cols-3 gap-6 px-7 py-6 max-sm:grid-cols-2 max-sm:px-4">
							<StatTile
								size="large"
								label="PRs merged"
								value={count(data.totals.prs)}
								detail="Unique linked PRs"
								className="max-sm:col-span-2"
							/>
							<StatTile
								size="large"
								label="Lines added"
								value={lines(data.totals.additions, data.totals.missingAdditions, data.totals.prs, "+")}
								valueClass="text-chart-added"
								detail={data.totals.missingAdditions ? missingDetail(data.totals.missingAdditions) : "In merged PRs"}
								className="border-l border-border pl-6 max-sm:border-0 max-sm:pl-0"
							/>
							<StatTile
								size="large"
								label="Lines deleted"
								value={lines(data.totals.deletions, data.totals.missingDeletions, data.totals.prs, "−")}
								valueClass="text-chart-deleted"
								detail={data.totals.missingDeletions ? missingDetail(data.totals.missingDeletions) : "In merged PRs"}
								className="border-l border-border pl-6 max-sm:border-0 max-sm:pl-0"
							/>
						</div>
						{data.totals.prs === 0 ? (
							<EmptyState description="No linked PRs merged in this range." className="px-7 pb-5" />
						) : (
							<>
								<div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-border px-7 py-2 max-sm:px-4">
									{selectedDay ? (
										<Chip
											label="Compare"
											op="on"
											value={formatDayLabel(selectedDay)}
											onRemove={() => selectDay(null)}
											removeLabel="Clear comparison date"
										/>
									) : (
										<p className="text-xs text-fg-muted">Select a date to compare both charts.</p>
									)}
								</div>
								<div className="grid grid-cols-1 gap-8 px-7 pt-6 pb-4 max-sm:px-4 lg:grid-cols-2">
									<section aria-label="PRs merged per day" className="flex min-w-0 flex-col gap-6">
										<SectionHeader title="PRs merged per day" level={4} appearance="overview" />
										<UsageChart
											label="PRs merged per day"
											days={days}
											series={prs}
											format={count}
											integerScale
											formatDay={formatDayLabel}
											selectedDay={selectedDay}
											onSelectDay={selectDay}
											appearance="overview"
										/>
									</section>
									<section aria-label="Lines changed per day" className="flex min-w-0 flex-col gap-6">
										<SectionHeader
											title={
												data.totals.missingAdditions || data.totals.missingDeletions
													? "Known lines changed per day"
													: "Lines changed per day"
											}
											level={4}
											appearance="overview"
										/>
										<UsageChart
											label="Lines changed per day"
											days={days}
											series={changes}
											format={formatTokens}
											formatDay={formatDayLabel}
											selectedDay={selectedDay}
											onSelectDay={selectDay}
											variant="grouped"
											appearance="overview"
										/>
										<p className="min-h-16 text-xs text-fg-muted" role="status">
											{selectedBucket
												? `${formatDayLabel(selectedBucket.day)}. Added: ${coverage(selectedBucket.missingAdditions)}. Deleted: ${coverage(selectedBucket.missingDeletions)}.`
												: "Charts show known lines only. A missing line count does not mean zero lines."}
										</p>
									</section>
								</div>
							</>
						)}
					</Panel>
				)
			)}
		</section>
	);
}
