import { useState } from "react";
import { cx } from "../../utils/cx";

// A tone is a palette color a series draws in. The four harnesses take the
// four tones in this order, so a harness keeps its color on every page.
export type UsageChartTone = "agent" | "accent" | "success" | "warning";

export type UsageChartSeries = {
	key: string;
	label: string;
	tone: UsageChartTone;
	// One value per day of `days`, in the same order.
	values: readonly number[];
};

export type UsageChartProps = {
	// The accessible name of the chart.
	label: string;
	// The calendar days of the range, oldest first, as `YYYY-MM-DD`.
	days: readonly string[];
	series: readonly UsageChartSeries[];
	format: (value: number) => string;
	formatDay: (day: string) => string;
	selectedDay: string | null;
	onSelectDay: (day: string | null) => void;
	className?: string;
};

const toneClass: Record<UsageChartTone, string> = {
	agent: "text-agent",
	accent: "text-accent",
	success: "text-success",
	warning: "text-warning",
};

// The gridlines, top first, as the share of the top value each one marks.
const GRID_LINES = [1, 0.75, 0.5, 0.25, 0] as const;

// A round number at or above `max`, so the top gridline prints a short
// figure such as 50 instead of 47.3.
const niceMax = (max: number) => {
	if (max <= 0) return 1;
	const power = 10 ** Math.floor(Math.log10(max));
	const unit = max / power;
	const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
	return step * power;
};

// The x of day `index` on a 100-wide box, and the y of `value` on a
// 100-tall box with 0 at the bottom.
const x = (index: number, count: number) => (count === 1 ? 50 : (index / (count - 1)) * 100);
const y = (value: number, top: number) => 100 - (value / top) * 100;

// The layered area chart of the usage page. Every series is measured from
// zero, and none is stacked on another: a stacked chart draws one series
// above the other on every day, which reads as "that one is larger" also on
// a day where it is not. The paths sit in an SVG that stretches to the box,
// with a stroke that keeps its width. The axis labels are HTML, so they
// never stretch. One button per day covers the chart, so a keyboard and a
// screen reader reach every day, and a click selects a day for the caption
// below the chart.
export function UsageChart({
	label,
	days,
	series,
	format,
	formatDay,
	selectedDay,
	onSelectDay,
	className,
}: UsageChartProps) {
	const [hoverDay, setHoverDay] = useState<string | null>(null);
	const top = niceMax(Math.max(0, ...series.flatMap((row) => row.values)));
	const count = days.length;
	const captionDay = hoverDay ?? selectedDay;
	const captionIndex = captionDay === null ? -1 : days.indexOf(captionDay);
	const ticks = count >= 3 ? [0, Math.floor(count / 2), count - 1] : days.map((_, index) => index);
	const dayTotal = (index: number) => series.reduce((sum, row) => sum + (row.values[index] ?? 0), 0);

	return (
		<figure className={cx("flex min-w-0 flex-col gap-2", className)}>
			<div className="flex min-w-0 gap-2">
				<div className="flex w-12 shrink-0 flex-col justify-between text-right text-xs text-fg-faint tabular">
					{GRID_LINES.map((share) => (
						<span key={share} className="leading-none">
							{format(top * share)}
						</span>
					))}
				</div>
				<div className="relative h-48 min-w-0 flex-1">
					<div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
						{GRID_LINES.map((share) => (
							<span key={share} className="block h-px w-full bg-border" />
						))}
					</div>
					<svg
						role="img"
						aria-label={label}
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						className="absolute inset-0 size-full overflow-visible"
					>
						{series.map((row) => {
							const points = row.values.map((value, index) => `${x(index, count)},${y(value, top)}`);
							const line = `M${points.join(" L")}`;
							const area = `${line} L100,100 L0,100 Z`;
							return (
								<g key={row.key} className={toneClass[row.tone]} data-series={row.key}>
									<path d={area} fill="currentColor" fillOpacity={0.12} stroke="none" />
									<path
										d={line}
										fill="none"
										stroke="currentColor"
										strokeWidth={2}
										strokeLinejoin="round"
										vectorEffect="non-scaling-stroke"
									/>
								</g>
							);
						})}
						{captionIndex >= 0 && (
							<line
								x1={x(captionIndex, count)}
								x2={x(captionIndex, count)}
								y1={0}
								y2={100}
								stroke="currentColor"
								strokeOpacity={0.5}
								strokeDasharray="4 3"
								vectorEffect="non-scaling-stroke"
								className="text-fg"
							/>
						)}
					</svg>
					<div className="absolute inset-0 flex">
						{days.map((day, index) => (
							<button
								key={day}
								type="button"
								aria-label={`${formatDay(day)}: ${format(dayTotal(index))}`}
								aria-pressed={selectedDay === day}
								onMouseEnter={() => setHoverDay(day)}
								onMouseLeave={() => setHoverDay(null)}
								onFocus={() => setHoverDay(day)}
								onBlur={() => setHoverDay(null)}
								onClick={() => onSelectDay(selectedDay === day ? null : day)}
								className="min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
							/>
						))}
					</div>
				</div>
			</div>
			<div className="flex pl-14 text-xs text-fg-faint tabular">
				{ticks.map((index, position) => (
					<span
						key={index}
						className={cx(
							"flex-1",
							position === 0 ? "text-left" : position === ticks.length - 1 ? "text-right" : "text-center",
						)}
					>
						{formatDay(days[index]!)}
					</span>
				))}
			</div>
			<figcaption role="status" className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 pl-14 text-sm">
				{captionIndex >= 0 ? (
					<>
						<span className="font-medium text-fg">{formatDay(days[captionIndex]!)}</span>
						{series.map((row) => (
							<span key={row.key} className="inline-flex items-center gap-1.5 text-fg-muted">
								<span
									aria-hidden="true"
									className={cx("inline-block size-2 rounded-hairline bg-current", toneClass[row.tone])}
								/>
								{row.label}
								<span className="text-fg tabular">{format(row.values[captionIndex] ?? 0)}</span>
							</span>
						))}
					</>
				) : (
					series.map((row) => (
						<span key={row.key} className="inline-flex items-center gap-1.5 text-fg-muted">
							<span
								aria-hidden="true"
								className={cx("inline-block size-2 rounded-hairline bg-current", toneClass[row.tone])}
							/>
							{row.label}
						</span>
					))
				)}
			</figcaption>
		</figure>
	);
}
