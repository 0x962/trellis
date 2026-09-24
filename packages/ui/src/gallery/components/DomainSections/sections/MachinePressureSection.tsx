import {
	MachinePressure,
	type MachinePressureMachineView,
	type MachinePressureReadingView,
} from "../../../../domain/MachinePressure";
import { Section } from "../../Section";

const readings = {
	cpuLoad: {
		key: "cpuLoad",
		label: "CPU load",
		value: "4.3",
		unit: "per core",
		tone: "danger",
		freshness: "live",
	},
	memory: {
		key: "memory",
		label: "Memory pressure",
		value: "Critical",
		unit: "level 4",
		tone: "danger",
		freshness: "live",
	},
	thermal: {
		key: "thermal",
		label: "Thermal state",
		value: "Serious",
		tone: "danger",
		freshness: "live",
	},
	temperature: {
		key: "temperature",
		label: "Processor temperature",
		value: "97",
		unit: "°C",
		tone: "danger",
		freshness: "live",
		detail: "PMU tdie6 sensor · 2.5 ms read",
	},
} as const satisfies Record<string, MachinePressureReadingView>;

const machine = (
	items: MachinePressureReadingView[],
	extra: Partial<MachinePressureMachineView> = {},
): MachinePressureMachineView[] => [
	{
		id: "server",
		name: "Canary-JQV57W1HPL",
		readings: items,
		runs: ["TRL-441 4.2 GB", "TRL-454 3.1 GB"],
		...extra,
	},
];

const usageLink = (
	<a
		href="#machine-pressure"
		className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
	>
		Open Usage for the full reading.
	</a>
);

const Example = ({ label, items }: { label: string; items: MachinePressureReadingView[] }) => (
	<div className="w-56 rounded-md border border-border bg-bg p-2">
		<p className="mb-1 text-xs text-fg-faint">{label}</p>
		<MachinePressure machines={machine(items)} usageLink={usageLink} />
	</div>
);

export function MachinePressureSection() {
	const all = Object.values(readings);
	return (
		<Section
			name="MachinePressure"
			note="each high signal, every signal, normal and lost absence, a stale sample, and the collapsed rail"
			className="items-start"
		>
			<div id="machine-pressure" className="flex flex-col gap-3">
				{Object.entries(readings).map(([key, reading]) => (
					<Example key={key} label={`${reading.label} alone`} items={[reading]} />
				))}
			</div>
			<div className="w-56 rounded-md border border-border bg-bg p-2">
				<p className="mb-1 text-xs text-fg-faint">All signals, panel open</p>
				<MachinePressure machines={machine(all)} usageLink={usageLink} open />
			</div>
			<div className="flex flex-col gap-3">
				<Example label="Normal or unavailable: no row" items={[]} />
				<div className="w-56 rounded-md border border-border bg-bg p-2">
					<p className="mb-1 text-xs text-fg-faint">Stale sample</p>
					<MachinePressure
						machines={machine([{ ...readings.cpuLoad, freshness: "stale" }], {
							ageText: "Last read 34 s ago.",
						})}
						usageLink={usageLink}
					/>
				</div>
				<Example label="Lost reader: no row" items={[]} />
			</div>
			<div className="rounded-md border border-border bg-bg p-2">
				<p className="mb-1 text-xs text-fg-faint">Collapsed rail</p>
				<MachinePressure machines={machine(all)} usageLink={usageLink} collapsed />
			</div>
		</Section>
	);
}
