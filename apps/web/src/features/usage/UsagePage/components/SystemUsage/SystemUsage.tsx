import { useQuery } from "@tanstack/react-query";
import { Button, FailureState, SectionHeader, Skeleton, StatTile, UsageChart } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { formatBytes } from "../../../../../lib/format";
import { ProcessTable } from "./components/ProcessTable";
import { formatAxisPercent, formatPercent, formatSampleTime, formatUptime } from "./formatSystemUsage";
import { memoryPressureLevel } from "./memoryPressure";

const USAGE_POLL_MS = 2_000;
const PROCESS_POLL_MS = 15_000;

export function SystemUsage() {
	const { orpc } = useApp();
	const [selectedSample, setSelectedSample] = useState<string | null>(null);
	const usage = useQuery({ ...orpc.system.usage.queryOptions({}), refetchInterval: USAGE_POLL_MS });
	// /bin/ps walks the whole process table, which costs about a second against
	// the two thousand processes of a busy Mac. This read runs far apart, so the
	// page does not add to the load that it reports.
	const processes = useQuery({ ...orpc.system.processes.queryOptions({}), refetchInterval: PROCESS_POLL_MS });

	const failure = usage.error ?? processes.error;
	if (failure !== null) {
		return (
			<FailureState
				title="Could not read system usage"
				detail={failure.message}
				action={
					<Button
						size="md"
						processing={usage.isFetching || processes.isFetching}
						onClick={() => {
							void usage.refetch();
							void processes.refetch();
						}}
					>
						Try again
					</Button>
				}
			/>
		);
	}

	const data = usage.data;
	const processData = processes.data;
	if (data === undefined || processData === undefined) {
		return (
			<div role="status" aria-label="Load system usage" className="flex max-w-7xl flex-col gap-3">
				<span className="sr-only">Load system usage</span>
				<Skeleton height="h-24" />
				<Skeleton height="h-64" />
				<Skeleton height="h-80" />
			</div>
		);
	}

	const times = data.history.map((sample) => sample.at);
	const memoryPressure = memoryPressureLevel(data.memoryLevel);
	return (
		<div className="flex max-w-7xl flex-col gap-8">
			<section aria-label="Right now" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<StatTile framed label="CPU" value={formatPercent(data.cpuPercent)} detail={`${data.cpuCount} logical cores`} />
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
				<StatTile
					framed
					label="Uptime"
					value={formatUptime(data.uptimeSeconds)}
					detail={`${processData.processCount.toLocaleString("en-US")} processes`}
				/>
			</section>

			<section aria-label="Recent history" className="flex flex-col gap-3">
				<SectionHeader title="Recent history" />
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
						<SectionHeader title="CPU history" level={3} />
						<UsageChart
							label="Recent CPU usage"
							days={times}
							series={[
								{ key: "cpu", label: "CPU", tone: "agent", values: data.history.map((sample) => sample.cpuPercent) },
							]}
							format={formatAxisPercent}
							formatDay={formatSampleTime}
							selectedDay={selectedSample}
							onSelectDay={setSelectedSample}
							max={100}
							variant="line"
						/>
					</div>
					<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
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
							selectedDay={selectedSample}
							onSelectDay={setSelectedSample}
							max={100}
							variant="line"
						/>
					</div>
				</div>
				<p className="text-xs text-fg-faint">
					{data.hostname} · {data.platform} · {data.cpuModel} · sampled {formatSampleTime(data.sampledAt)} · updates
					every 2 seconds
				</p>
			</section>

			<ProcessTable processes={processData.processes} />
		</div>
	);
}
