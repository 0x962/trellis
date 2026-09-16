import { ArrowClockwise } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { AccountHarness, UsageDays, UsageGroupBy, UsageMetric } from "@trellis/api";
import { Button, EmptyState, IconButton, SectionHeader, Segmented, Skeleton, Tooltip, UsageChart } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { formatDayLabel, formatMetric, harnessLabel, harnessTone, localDayKey } from "../formatUsage";
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

const HARNESSES: readonly AccountHarness[] = ["claude", "codex", "opencode", "pi"];

// What every agent on this machine consumed: the subscription quota of each
// account, then the token cost of the range from the transcripts, sliced by
// ticket, persona, project, agent kind, account, model, or harness. A
// selected row filters the chart and the session list to that slice.
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
	const data = report.data;
	const rows = data?.groups[group] ?? [];
	const row = selectedRow === null ? null : (rows.find((candidate) => candidate.key === selectedRow) ?? null);
	const chartDays = data?.buckets.map((bucket) => bucket.day) ?? [];
	const series = row
		? [
				{
					key: row.key,
					label: row.label,
					tone: row.harness ? harnessTone[row.harness] : ("agent" as const),
					values: chartDays.map((day) => row.days.find((slice) => slice.day === day)?.[metric] ?? 0),
				},
			]
		: HARNESSES.filter((harness) => data?.buckets.some((bucket) => bucket.harnesses[harness])).map((harness) => ({
				key: harness,
				label: harnessLabel[harness],
				tone: harnessTone[harness],
				values: chartDays.map(
					(day) => data?.buckets.find((bucket) => bucket.day === day)?.harnesses[harness]?.[metric] ?? 0,
				),
			}));

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
							<section aria-label="Token cost" className="flex flex-col gap-4">
								<SectionHeader
									title="Token cost"
									count={`${formatMetric(metric, row ? row[metric] : report.data.totals[metric])}${metric === "usd" ? " at API rates" : ""}`}
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
									label={row ? `${row.label} per day` : `${metric === "usd" ? "Cost" : "Tokens"} per day by harness`}
									days={chartDays}
									series={series}
									format={(value) => formatMetric(metric, value)}
									formatDay={formatDayLabel}
									selectedDay={selectedDay}
									onSelectDay={(day) => setSearch({ day: day ?? undefined })}
								/>
								<UsageTotals totals={report.data.totals} pricingTableUpdated={report.data.pricingTableUpdated} />
							</section>
							<UsageGroups
								group={group}
								rows={rows}
								metric={metric}
								total={report.data.totals[metric]}
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
