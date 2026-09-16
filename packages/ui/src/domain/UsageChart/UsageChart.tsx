import { useState } from "react";
import { cx } from "../../utils/cx";
import { type ChartTone, chartFillClass, chartToneClass } from "../chartTones";

export type UsageChartTone = ChartTone;

export type UsageChartSeries = {
	key: string;
	label: string;
	tone: ChartTone;
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

// The gridlines, top first, as the share of the top value each one marks.
const GRID_LINES = [1, 0.75, 0.5, 0.25, 0] as const;

// A round number at or above `max`, so the top gridline prints a short
// figure such as 50 instead of 47.3.
const niceMax = (max: number) => {
	if (max <= 0) return 1;
	const power = 10 ** Math.floor(Math.log10(max));
	const unit = max / power;
	const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 4 ? 4 : unit <= 5 ? 5 : 10;
	return step * power;
};

// The stacked bar chart of the usage page: one bar per day, one segment per
// series, bottom to top in series order. A stack is right for a sum such as
// cost or tokens, because the top of the bar is the day total and each
// segment is its share. The bars sit in an SVG that stretches to the box,
// and the axis labels are HTML, so they never stretch. One button per day
// covers the chart, so a keyboard and a screen reader reach every day, and
// a click selects a day for the caption below the chart.
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
	const count = days.length;
	const dayTotal = (index: number) => series.reduce((sum, row) => sum + (row.values[index] ?? 0), 0);
	const top = niceMax(Math.max(0, ...days.map((_, index) => dayTotal(index))));
	const captionDay = hoverDay ?? selectedDay;
	const captionIndex = captionDay === null ? -1 : days.indexOf(captionDay);
	const ticks = count >= 3 ? [0, Math.floor(count / 2), count - 1] : days.map((_, index) => index);
	// A bar takes 70% of its day slot, so a short range keeps a gap between bars.
	const slot = 100 / Math.max(1, count);
	const barWidth = slot * 0.7;

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
						className="absolute inset-0 size-full"
					>
						{days.map((day, index) => {
							let stacked = 0;
							const dim = captionIndex >= 0 && captionIndex !== index;
							return (
								<g key={day} data-day={day} className={cx(dim && "opacity-60")}>
									{series.map((row) => {
										const value = row.values[index] ?? 0;
										if (value <= 0) return null;
										const height = (value / top) * 100;
										stacked += height;
										return (
											<rect
												key={row.key}
												data-series={row.key}
												x={index * slot + (slot - barWidth) / 2}
												y={100 - stacked}
												width={barWidth}
												height={height}
												className={chartFillClass[row.tone]}
											/>
										);
									})}
								</g>
							);
						})}
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
								className={cx(
									"min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
									selectedDay === day && "border-b-2 border-fg",
								)}
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
				{captionIndex >= 0 && (
					<span className="font-medium text-fg tabular">
						{formatDay(days[captionIndex]!)} · {format(dayTotal(captionIndex))}
					</span>
				)}
				{series.map((row) => (
					<span key={row.key} className="inline-flex min-w-0 items-center gap-1.5 text-fg-muted">
						<span
							aria-hidden="true"
							className={cx("inline-block size-2 shrink-0 rounded-hairline bg-current", chartToneClass[row.tone])}
						/>
						<span className="truncate">{row.label}</span>
						{captionIndex >= 0 && <span className="text-fg tabular">{format(row.values[captionIndex] ?? 0)}</span>}
					</span>
				))}
			</figcaption>
		</figure>
	);
}
