import { SectionHeader } from "../../../../../../../../primitives/SectionHeader";
import type { MachinePressureReadingView } from "../../../../../../MachinePressure";

export function MachineDetails({ readings }: { readings: MachinePressureReadingView[] }) {
	return (
		<section aria-label="Sensor details">
			<SectionHeader title="Sensor details" level={3} />
			<dl className="mt-3 space-y-4">
				{readings.flatMap(
					(reading) =>
						reading.details?.map((detail) => (
							<div key={`${reading.key}:${detail.label}`} className="text-sm">
								<dt className="text-fg-muted">{detail.label}</dt>
								<dd className="mt-1 break-all text-fg tabular">{detail.value}</dd>
							</div>
						)) ?? [],
				)}
			</dl>
			<p className="mt-5 text-xs text-fg-faint">CPU load is the system load per core. It is not a percentage.</p>
		</section>
	);
}
