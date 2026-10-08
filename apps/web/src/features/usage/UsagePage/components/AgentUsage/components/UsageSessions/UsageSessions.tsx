import type { UsageGroupBy, UsageMetric, UsageReport } from "@trellis/api";
import { Button, EmptyState, FailureState, Pagination, Panel, RankedBars, SectionHeader, Skeleton } from "@trellis/ui";
import { useState } from "react";
import { formatDayLabel, formatMetric, harnessLabel } from "../../../../../formatUsage";
import { useUsageRanking } from "../useUsageRanking";
import { UsageSessionDetails } from "./components/UsageSessionDetails";

export function UsageSessions({
	report,
	group,
	row,
	day,
	metric,
	clearRow,
}: {
	report: UsageReport;
	group: UsageGroupBy;
	row: string | null;
	day: string | null;
	metric: UsageMetric;
	clearRow: () => void;
}) {
	const query = useUsageRanking(report, group, metric, row, day, clearRow);
	const [selected, setSelected] = useState<string | null>(null);
	const sessions = query.data?.sessions ?? [];
	const details = sessions.find((session) => `${session.harness}:${session.sessionId}` === selected);
	const rows = sessions.map((session) => ({
		key: `${session.harness}:${session.sessionId}`,
		label: session.label ?? session.run?.name ?? session.sessionId,
		detail: `${harnessLabel[session.harness]} · ${session.model}`,
		value: session[metric],
		valueLabel: `${metric === "usd" && session.approximate ? "~" : ""}${formatMetric(metric, session[metric])}`,
		share: report.totals[metric] > 0 ? session[metric] / report.totals[metric] : 0,
		tone: "usage" as const,
	}));
	return (
		<Panel aria-label="Matching sessions" className="flex min-w-0 flex-col gap-4 px-6 py-5 max-sm:px-4">
			<SectionHeader title="Matching sessions" level={3} count={query.data?.sessionTotal} />
			<p className="text-sm text-fg-muted">
				Select a session to inspect its cost and attribution. Percentages use the full report total.
			</p>
			{day && (
				<p className="text-sm text-fg-muted">
					Date: {formatDayLabel(day)}. The date selects sessions whose first and last recorded turns span that day.
					Session values cover the full report range.
				</p>
			)}
			{query.isPending ? (
				<Skeleton height="h-48" />
			) : query.isError ? (
				<FailureState
					title="Could not read session usage"
					detail={query.error.message}
					action={<Button onClick={() => void query.refetch()}>Try again</Button>}
				/>
			) : sessions.length === 0 ? (
				<EmptyState
					title="No matching sessions"
					description="Clear the date or attribution filter to see more sessions."
				/>
			) : (
				<RankedBars
					label="Session usage"
					rows={rows}
					selected={selected}
					onSelect={setSelected}
					limit={10}
					appearance="overview"
				/>
			)}
			<Pagination
				label="sessions"
				start={query.data?.sessionStart ?? 0}
				count={sessions.length}
				total={query.data?.sessionTotal ?? 0}
				pending={query.isFetching}
				onPage={query.changeSessionPage}
			/>
			{details && <UsageSessionDetails session={details} onClose={() => setSelected(null)} />}
		</Panel>
	);
}
