import type { ChartTone } from "../../../chartTones";

type SelectionSeries = {
	key: string;
	tone: ChartTone;
	tones?: readonly ChartTone[];
	values: readonly number[];
};

type UsageChartSelectionMarkerProps = {
	variant: "bar" | "line";
	selectedDay: string | null;
	selectedIndex: number;
	series: readonly SelectionSeries[];
	point: (index: number, value: number) => { x: number; y: number };
	slot: number;
	barWidth: number;
	overlay?: boolean;
};

const chartBorderColor: Record<ChartTone, string> = {
	agent: "var(--agent)",
	fg: "var(--fg)",
	faint: "var(--fg-faint)",
	success: "var(--success)",
	warning: "var(--warning)",
	danger: "var(--danger)",
	accent: "var(--accent)",
};

export function UsageChartSelectionMarker({
	variant,
	selectedDay,
	selectedIndex,
	series,
	point,
	slot,
	barWidth,
	overlay = false,
}: UsageChartSelectionMarkerProps) {
	if (selectedIndex < 0) return null;

	if (overlay) {
		if (variant !== "line") return null;
		return series.map((row) => {
			const selectedPoint = point(selectedIndex, row.values[selectedIndex] ?? 0);
			return (
				<span
					key={row.key}
					aria-hidden="true"
					data-selected-series={row.key}
					className="pointer-events-none absolute block size-2 -translate-x-1/2 -translate-y-1/2 rounded-round bg-bg"
					style={{
						left: `${selectedPoint.x}%`,
						top: `${selectedPoint.y}%`,
						borderColor: chartBorderColor[row.tones?.[selectedIndex] ?? row.tone],
						borderStyle: "solid",
						borderWidth: "calc(var(--border-width-hairline) * 2)",
					}}
				/>
			);
		});
	}

	if (variant === "line") {
		return (
			<g data-selected-day={selectedDay ?? undefined}>
				<line
					x1={point(selectedIndex, 0).x}
					y1="0"
					x2={point(selectedIndex, 0).x}
					y2="100"
					stroke="currentColor"
					strokeWidth="var(--border-width-hairline)"
					strokeDasharray="var(--spacing) var(--spacing)"
					vectorEffect="non-scaling-stroke"
					className="text-accent"
				/>
			</g>
		);
	}

	return (
		<line
			data-selected-day={selectedDay ?? undefined}
			x1={selectedIndex * slot + (slot - barWidth) / 2}
			y1="99"
			x2={selectedIndex * slot + (slot + barWidth) / 2}
			y2="99"
			stroke="currentColor"
			strokeWidth="calc(var(--border-width-hairline) * 2)"
			vectorEffect="non-scaling-stroke"
			className="text-fg"
		/>
	);
}
