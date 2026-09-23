import { useQuery } from "@tanstack/react-query";
import { Button, cx, SectionHeader, Skeleton, UsageChart } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { formatBytes } from "../../../../../lib/format";
import { formatPercent, formatSampleTime, formatUptime } from "./formatSystemUsage";
import { memoryPressureLevel } from "./memoryPressure";
import { ProcessTable } from "./ProcessTable";

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
			<div
				role="alert"
				className="mt-5 flex max-w-7xl items-center justify-between gap-3 rounded-lg border border-border p-4"
			>
				<p className="text-sm text-danger">Unable to read system usage. {failure.message}</p>
				<Button
					disabled={usage.isFetching || processes.isFetching}
					onClick={() => {
						void usage.refetch();
						void processes.refetch();
					}}
				>
					Retry
				</Button>
			</div>
		);
	}

	const data = usage.data;
	const processData = processes.data;
	if (data === undefined || processData === undefined) {
		return (
			<div role="status" aria-label="Load system usage" className="flex max-w-7xl flex-col gap-3 pt-5">
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
		<div className="flex max-w-7xl flex-col gap-8 pt-5">
			<section
				aria-label="Current system usage"
				className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1"
			>
				<dl className="rounded-lg border border-border p-4">
					<dt className="text-sm text-fg-muted">CPU</dt>
					<dd className="mt-1 text-2xl font-semibold text-fg tabular">{formatPercent(data.cpuPercent)}</dd>
					<dd className="mt-1 text-xs text-fg-faint">{data.cpuCount} logical cores</dd>
				</dl>
				<dl className="rounded-lg border border-border p-4">
					<dt className="text-sm text-fg-muted">Memory</dt>
					<dd className={cx("mt-1 text-2xl font-semibold tabular", memoryPressure.textClass)}>
						{formatPercent(data.memoryPercent)}
					</dd>
					<dd className="mt-1 text-xs text-fg-faint tabular">
						<span className={memoryPressure.textClass}>{memoryPressure.label}</span> ·{" "}
						{formatBytes(data.memoryUsedBytes)} of {formatBytes(data.memoryTotalBytes)} used
					</dd>
				</dl>
				<dl className="rounded-lg border border-border p-4">
					<dt className="text-sm text-fg-muted">Load average</dt>
					<dd className="mt-1 text-2xl font-semibold text-fg tabular">{data.loadAverage[0].toFixed(2)}</dd>
					<dd className="mt-1 text-xs text-fg-faint tabular">
						{data.loadAverage.map((value) => value.toFixed(2)).join(" · ")} over 1, 5, and 15 minutes
					</dd>
				</dl>
				<dl className="rounded-lg border border-border p-4">
					<dt className="text-sm text-fg-muted">Processes</dt>
					<dd className="mt-1 text-2xl font-semibold text-fg tabular">{processData.processCount}</dd>
					<dd className="mt-1 text-xs text-fg-faint tabular">Uptime {formatUptime(data.uptimeSeconds)}</dd>
				</dl>
			</section>

			<section aria-label="Recent history" className="flex flex-col gap-4">
				<SectionHeader
					title="Recent history"
					count={`${data.history.length} samples`}
					actions={<span>Updates every 2 seconds</span>}
				/>
				<div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
					<div className="rounded-lg border border-border p-4">
						<h3 className="mb-4 text-sm font-medium text-fg">CPU history</h3>
						<UsageChart
							label="Recent CPU usage"
							days={times}
							series={[
								{ key: "cpu", label: "CPU", tone: "agent", values: data.history.map((sample) => sample.cpuPercent) },
							]}
							format={formatPercent}
							formatDay={formatSampleTime}
							selectedDay={selectedSample}
							onSelectDay={setSelectedSample}
							max={100}
							variant="line"
						/>
					</div>
					<div className="rounded-lg border border-border p-4">
						<h3 className="mb-4 text-sm font-medium text-fg">Memory history</h3>
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
							format={formatPercent}
							formatDay={formatSampleTime}
							selectedDay={selectedSample}
							onSelectDay={setSelectedSample}
							max={100}
							variant="line"
						/>
					</div>
				</div>
				<p className="text-xs text-fg-faint">
					{data.hostname} · {data.platform} · {data.cpuModel} · sampled {formatSampleTime(data.sampledAt)}
				</p>
			</section>

			<ProcessTable processes={processData.processes} />
		</div>
	);
}
