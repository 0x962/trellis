import { Memory, Thermometer } from "@phosphor-icons/react";
import { memoryIsRed, type PressureRun } from "@trellis/api";
import { formatBytes } from "../../../lib/format";
import { useMachinePressure } from "./useMachinePressure";

// A run carries a ticket identifier when a ticket started it. A session run
// carries none, and its own name stands for it.
const runLabel = (run: PressureRun) => `${run.ticketIdentifier ?? run.name} ${formatBytes(run.memoryBytes)}`;

// The bar over every page of the app while the Mac sits at a red line. It
// holds no close control, because it reports a state of the computer: it
// appears when the computer reaches the line and it goes when the computer
// recovers.
export function MachinePressureBanner() {
	const { warning, memoryLevel, runs } = useMachinePressure();
	if (warning === null) return null;
	const Icon = memoryIsRed(memoryLevel) ? Memory : Thermometer;
	return (
		<div
			role="status"
			className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-danger/30 border-b bg-danger-soft px-5 py-1.5 text-sm"
		>
			<Icon size={16} weight="regular" aria-hidden className="shrink-0 text-danger" />
			<span className="font-medium text-fg">{warning.headline}</span>
			<span className="text-fg-muted">{warning.consequences.join(" ")}</span>
			{runs.length > 0 && (
				<span className="text-fg-muted tabular">Heaviest runs: {runs.map(runLabel).join(" · ")}</span>
			)}
		</div>
	);
}
