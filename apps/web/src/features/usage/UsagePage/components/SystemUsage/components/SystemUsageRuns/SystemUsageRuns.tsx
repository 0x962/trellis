import { useQuery } from "@tanstack/react-query";
import { EmptyState, FailureState, MachineRuns, SectionHeader, Skeleton } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { formatBytes } from "../../../../../../../lib/format";
import { formatSampleTime } from "../../formatSystemUsage";

export function SystemUsageRuns() {
	const { orpc } = useApp();
	const pressure = useQuery({
		...orpc.system.pressure.queryOptions({ input: { includeRuns: true } }),
		refetchInterval: 5_000,
	});
	return (
		<section aria-label="Memory attribution" className="flex flex-col gap-3">
			<SectionHeader title="Memory attribution" />
			<p className="text-xs text-fg-muted">
				The three active runs with the most measured memory. These values describe process groups, not CPU use.
			</p>
			{pressure.data === undefined ? (
				pressure.error === null ? (
					<div role="status" aria-label="Load memory attribution">
						<Skeleton height="h-24" />
					</div>
				) : (
					<FailureState title="Could not read memory attribution" recovery="retrying" detail={pressure.error.message} />
				)
			) : (
				<>
					<p className="text-xs text-fg-muted tabular">
						Latest successful sample at {formatSampleTime(pressure.data.sampledAt)}. Updates every 5 seconds.
					</p>
					{pressure.data.runs.length === 0 ? (
						<EmptyState
							title="No measured runs"
							description="Only active runs with measured memory appear here."
							image={null}
						/>
					) : (
						<MachineRuns
							runs={pressure.data.runs.map((run) => ({
								id: run.id,
								label: run.ticketIdentifier ?? run.name,
								memory: formatBytes(run.memoryBytes),
							}))}
						/>
					)}
					{pressure.error !== null && (
						<FailureState
							title="Could not update memory attribution"
							description="These values are out of date. The last successful sample remains visible."
							recovery="retrying"
							detail={pressure.error.message}
						/>
					)}
				</>
			)}
		</section>
	);
}
