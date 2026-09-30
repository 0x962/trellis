import { Badge } from "../../../../../../../../primitives/Badge";
import { EmptyState } from "../../../../../../../../primitives/EmptyState";
import { cx } from "../../../../../../../../utils/cx";
import type { MachinePressureReadingView } from "../../../../../../MachinePressure";

const freshnessText = { live: "", stale: "Stale reading", unavailable: "Reading unavailable", lost: "Reading lost" };
const toneClass = { normal: "text-fg", warning: "text-warning", danger: "text-danger" };

export function MachineOverview({ readings }: { readings: MachinePressureReadingView[] }) {
	if (readings.length === 0)
		return <EmptyState title="No readings" description="Machine readings appear here when available." image={null} />;
	const disk = readings.find((reading) => reading.key === "disk");
	const metrics = [
		...readings.filter((reading) => reading.key !== "disk" && reading.key !== "thermal"),
		...readings.filter((reading) => reading.key === "thermal"),
	];
	return (
		<div>
			<dl className="grid grid-cols-2 gap-x-5 max-sm:gap-x-3">
				{metrics.map((reading) => {
					const pressure = reading.key === "memory" || reading.key === "thermal";
					const known = reading.value !== "Unknown" && reading.freshness === "live";
					return (
						<div key={reading.key} className="row-span-3 grid min-w-0 grid-rows-subgrid pb-3">
							<dt className="text-sm text-fg-muted">{reading.label}</dt>
							<dd className={cx("mt-1 flex min-h-8 flex-wrap items-baseline gap-x-1 tabular", toneClass[reading.tone])}>
								{pressure ? (
									<Badge
										tone={
											!known
												? "neutral"
												: reading.tone === "danger"
													? "bad"
													: reading.tone === "warning"
														? "wait"
														: "ok"
										}
									>
										{reading.value}
									</Badge>
								) : (
									<span
										className={cx(
											"font-medium",
											reading.freshness === "unavailable" || reading.freshness === "lost"
												? "text-sm text-fg-muted"
												: "text-2xl",
										)}
									>
										{reading.value}
									</span>
								)}
								{reading.unit && <span className="text-sm text-fg-muted">{reading.unit}</span>}
								{reading.tone !== "normal" && (
									<span className="sr-only">{reading.tone === "danger" ? "Critical" : "Warning"}</span>
								)}
							</dd>
							<dd className="mt-1 min-h-4 text-xs text-fg-muted">{freshnessText[reading.freshness]}</dd>
						</div>
					);
				})}
			</dl>
			{disk && (
				<div className="mt-4 border-t border-border pt-4">
					<dl>
						<div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
							<dt className="text-fg-muted">{disk.label}</dt>
							<dd className={cx("tabular", toneClass[disk.tone])}>
								<span className="font-medium">{disk.value}</span>
								{disk.unit && <span className="ml-1 text-fg-muted">{disk.unit}</span>}
							</dd>
						</div>
					</dl>
					{disk.capacity && (
						<>
							<meter
								className="sr-only"
								aria-label="Disk space used"
								min={0}
								max={100}
								value={disk.capacity.usedPercent}
							/>
							<div className="my-2 h-1 overflow-hidden rounded-round bg-border-strong" aria-hidden="true">
								<div
									className={cx(
										"h-full rounded-round",
										disk.tone === "danger" ? "bg-danger" : disk.tone === "warning" ? "bg-warning" : "bg-fg-faint",
									)}
									style={{ width: `${disk.capacity.usedPercent}%` }}
								/>
							</div>
							<div className="flex justify-between gap-2 text-xs text-fg-faint tabular">
								<span>{disk.capacity.usedPercent.toFixed(1)}% used</span>
								<span>{disk.capacity.total} total</span>
							</div>
						</>
					)}
					<p className="mt-1 min-h-4 text-xs text-fg-muted">
						{freshnessText[disk.freshness]}
						{disk.tone !== "normal" && (
							<span className="ml-1">{disk.tone === "danger" ? "Critically low space" : "Low space"}</span>
						)}
					</p>
				</div>
			)}
		</div>
	);
}
