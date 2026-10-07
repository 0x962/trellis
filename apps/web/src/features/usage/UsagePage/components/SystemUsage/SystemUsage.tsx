import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, FailureState, Panel, SectionHeader, Skeleton, StatTile, UsageChart } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { formatBytes } from "../../../../../lib/format";
import { SystemUsageRuns } from "./components/SystemUsageRuns";
import { formatAxisPercent, formatPercent, formatSampleTime, formatUptime } from "./formatSystemUsage";
import { memoryPressureLevel } from "./memoryPressure";

const USAGE_POLL_MS = 2_000;

export function SystemUsage() {
	const { orpc } = useApp();
	const [selectedSample, setSelectedSample] = useState<string | null>(null);
	const usage = useQuery({ ...orpc.system.usage.queryOptions({}), refetchInterval: USAGE_POLL_MS });

	const failure = usage.error;
	if (failure !== null && usage.data === undefined) {
		return (
			<FailureState
				title="Could not read system usage"
				recovery="retrying"
				detail={failure.message}
				action={
					<Button
						size="md"
						processing={usage.isFetching}
						onClick={() => {
							void usage.refetch();
						}}
					>
						Try again
					</Button>
				}
			/>
		);
	}

	const data = usage.data;
	if (data === undefined) {
		return (
			<div role="status" aria-label="Load system usage" className="flex max-w-7xl flex-col gap-3">
				<span className="sr-only">Load system usage</span>
				<Skeleton height="h-24" />
				<Skeleton height="h-64" />
			</div>
		);
	}

	const times = data.history.map((sample) => sample.at);
	const memoryPressure = memoryPressureLevel(data.memoryLevel);
	const sample = data.history.find((entry) => entry.at === selectedSample);
	const selectedAt = sample?.at ?? null;
	return (
		<div className="flex max-w-7xl flex-col gap-8">
			<section aria-label="Current metrics" className="flex flex-col gap-3">
				<SectionHeader
					title="Current metrics"
					actions={
						<span className="w-20 text-right text-xs text-fg-muted">{failure === null ? "Live" : "Out of date"}</span>
					}
				/>
				<p className="text-xs text-fg-muted tabular">
					Latest successful sample at {formatSampleTime(data.sampledAt)}. Updates every 2 seconds.
				</p>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
					<StatTile
						framed
						label="CPU"
						value={formatPercent(data.cpuPercent)}
						detail={`${data.cpuCount} logical cores`}
					/>
					<StatTile
						framed
						label="Memory"
						value={formatPercent(data.memoryPercent)}
						valueClass={memoryPressure.valueClass}
						detail={
							<>
								<span className={memoryPressure.textClass}>{memoryPressure.label}</span> ·{" "}
								{formatBytes(data.memoryUsedBytes)} of {formatBytes(data.memoryTotalBytes)} used
							</>
						}
					/>
					<StatTile
						framed
						label="Load average"
						value={data.loadAverage[0].toFixed(2)}
						detail={`Over 1 minute · ${data.loadAverage[1].toFixed(2)} over 5 · ${data.loadAverage[2].toFixed(2)} over 15`}
					/>
					<StatTile framed label="Uptime" value={formatUptime(data.uptimeSeconds)} />
				</div>
				<p className="break-words text-xs text-fg-muted">
					{data.hostname} · {data.platform} · {data.cpuModel}
				</p>
			</section>

			<section aria-label="Recent history" className="flex flex-col gap-3">
				<SectionHeader title="Recent history" />
				{times.length === 0 ? (
					<EmptyState
						title="No recent samples"
						description="Current metrics remain available. Recent samples appear here after the next update."
						image={null}
					/>
				) : (
					<>
						<p className="text-xs text-fg-muted tabular">
							{times.length} samples from {formatSampleTime(times[0]!)} to {formatSampleTime(times[times.length - 1]!)}.
						</p>
						<p className="min-h-10 text-sm text-fg-muted tabular max-md:min-h-20" aria-live="polite">
							{sample === undefined ? (
								"Select a sample in either chart to read CPU, memory, and pressure."
							) : (
								<>
									Selected sample at {formatSampleTime(sample.at)} · CPU {formatPercent(sample.cpuPercent)} · memory{" "}
									{formatPercent(sample.memoryPercent)} · pressure{" "}
									<span className={memoryPressureLevel(sample.memoryLevel).textClass}>
										{memoryPressureLevel(sample.memoryLevel).label}
									</span>
								</>
							)}
						</p>
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
							<Panel className="flex flex-col gap-3 p-4">
								<SectionHeader title="CPU history" level={3} />
								<UsageChart
									label="Recent CPU usage"
									days={times}
									series={[
										{
											key: "cpu",
											label: "CPU",
											tone: "agent",
											values: data.history.map((sample) => sample.cpuPercent),
										},
									]}
									format={formatAxisPercent}
									formatDay={formatSampleTime}
									selectedDay={selectedAt}
									onSelectDay={setSelectedSample}
									max={100}
									variant="line"
								/>
							</Panel>
							<Panel className="flex flex-col gap-3 p-4">
								<SectionHeader title="Memory history" level={3} />
								<UsageChart
									label="Recent memory use"
									days={times}
									series={[
										{
											key: "memory",
											label: "Memory",
											tone: memoryPressure.tone,
											tones: data.history.map((sample) => memoryPressureLevel(sample.memoryLevel).tone),
											values: data.history.map((sample) => sample.memoryPercent),
										},
									]}
									format={formatAxisPercent}
									formatDay={formatSampleTime}
									selectedDay={selectedAt}
									onSelectDay={setSelectedSample}
									max={100}
									variant="line"
								/>
							</Panel>
						</div>
					</>
				)}
				{failure !== null && (
					<FailureState
						title="Could not update system usage"
						description="These values are out of date. The last successful sample remains visible."
						recovery="retrying"
						detail={failure.message}
					/>
				)}
			</section>
			<SystemUsageRuns />
		</div>
	);
}
