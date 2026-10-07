import { EmptyState } from "../../primitives/EmptyState";
import { SectionHeader } from "../../primitives/SectionHeader";
import type { MachinePressureMachineView } from "../MachinePressure";

export function MachineRuns({ runs = [] }: Pick<MachinePressureMachineView, "runs">) {
	return (
		<section aria-label="Largest runs by memory">
			<SectionHeader title="Largest runs" level={3} actions="Memory" />
			{runs.length === 0 ? (
				<EmptyState title="No active runs" description="Active runs appear here with their memory use." image={null} />
			) : (
				<dl className="mt-1">
					{runs.map((run) => (
						<div key={run.id} className="flex min-h-8 items-baseline justify-between gap-3 py-1.5 text-sm">
							<dt className="min-w-0 break-words">{run.label}</dt>
							<dd className="shrink-0 text-fg-muted tabular">{run.memory}</dd>
						</div>
					))}
				</dl>
			)}
		</section>
	);
}
