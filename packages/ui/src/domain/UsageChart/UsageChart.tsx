import { type KeyboardEvent, type MouseEvent, useId, useMemo, useState } from "react";
import { cx } from "../../utils/cx";
import { type ChartTone, chartFillClass, chartToneClass } from "../chartTones";
import { UsageChartSelectionMarker } from "./components/UsageChartSelectionMarker";
import { isUsageChartSelectKey, nextUsageChartFocusIndex } from "./nextUsageChartFocusIndex";

export type UsageChartTone = ChartTone;

export type UsageChartSeries = {
	key: string;
	label: string;
	tone: ChartTone;
	tones?: readonly ChartTone[];
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
	// A percentage chart uses 100 so a small value does not fill the plot.
	max?: number;
	variant?: "bar" | "line";
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

export function UsageChart({
	label,
	days,
	series,
	format,
	formatDay,
	selectedDay,
	onSelectDay,
	max,
	variant = "bar",
	className,
}: UsageChartProps) {
	const [hoverDay, setHoverDay] = useState<string | null>(null);
	const [hasFocus, setHasFocus] = useState(false);
	const [cursor, setCursor] = useState(() => ({ day: selectedDay ?? days[0] ?? null, index: 0 }));
	const instructionsId = useId();
	const count = days.length;
	const dayIndexByDay = useMemo(() => new Map(days.map((day, index) => [day, index])), [days]);
	const dayTotal = (index: number) => series.reduce((sum, row) => sum + (row.values[index] ?? 0), 0);
	const top = max ?? niceMax(Math.max(0, ...days.map((_, index) => dayTotal(index))));
	const selectedIndex = selectedDay === null ? -1 : (dayIndexByDay.get(selectedDay) ?? -1);
	const cursorIndex = cursor.day === null ? -1 : (dayIndexByDay.get(cursor.day) ?? -1);
	const focusIndex =
		count === 0
			? -1
			: cursorIndex >= 0
				? cursorIndex
				: selectedIndex >= 0
					? selectedIndex
					: Math.min(cursor.index, count - 1);
	const focusDay = focusIndex < 0 ? null : days[focusIndex]!;
	const hoverIndex = hoverDay === null ? -1 : (dayIndexByDay.get(hoverDay) ?? -1);
	const captionIndex = hoverIndex >= 0 ? hoverIndex : hasFocus ? focusIndex : selectedIndex;
	const ticks = count >= 3 ? [0, Math.floor(count / 2), count - 1] : days.map((_, index) => index);
	// A bar takes 70% of its day slot, so a short range keeps a gap between bars.
	const slot = 100 / Math.max(1, count);
	const barWidth = slot * 0.7;
	const point = (index: number, value: number) => ({
		x: count <= 1 ? 50 : (index / (count - 1)) * 100,
		y: 100 - (value / top) * 100,
	});
	const indexAtPointer = (event: MouseEvent<HTMLButtonElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect();
		return Math.min(count - 1, Math.max(0, Math.floor(((event.clientX - bounds.left) / bounds.width) * count)));
	};
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (isUsageChartSelectKey(event.key)) {
			event.preventDefault();
			toggleDaySelection(focusIndex);
			return;
		}
		const nextIndex = nextUsageChartFocusIndex(event.key, focusIndex, count);
		if (nextIndex === null) return;
		event.preventDefault();
		setCursor({ day: days[nextIndex]!, index: nextIndex });
	};
	function toggleDaySelection(index: number) {
		const day = days[index]!;
		setCursor({ day, index });
		onSelectDay(selectedDay === day ? null : day);
	}

	return (
		<figure className={cx("flex min-w-0 flex-col gap-2", className)}>
			<span id={instructionsId} className="sr-only">
				Use Left and Right to inspect days. Use Home and End to move to the first or last day. Press Enter or Space to
				select or clear a day.
			</span>
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
						{variant === "bar"
							? days.map((day, index) => {
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
								})
							: series.map((row) =>
									row.values.length === 1 ? (
										<line
											key={row.key}
											data-series={row.key}
											x1="49.5"
											y1={point(0, row.values[0] ?? 0).y}
											x2="50.5"
											y2={point(0, row.values[0] ?? 0).y}
											stroke="currentColor"
											strokeWidth="calc(var(--border-width-hairline) * 2)"
											strokeLinecap="round"
											vectorEffect="non-scaling-stroke"
											className={chartToneClass[row.tones?.[0] ?? row.tone]}
										/>
									) : (
										<g key={row.key} data-series={row.key}>
											{row.values.slice(1).map((value, index) => {
												const from = point(index, row.values[index] ?? 0);
												const to = point(index + 1, value);
												return (
													<line
														key={days[index + 1]}
														x1={from.x}
														y1={from.y}
														x2={to.x}
														y2={to.y}
														stroke="currentColor"
														strokeWidth="calc(var(--border-width-hairline) * 2)"
														strokeLinecap="round"
														strokeLinejoin="round"
														vectorEffect="non-scaling-stroke"
														className={chartToneClass[row.tones?.[index + 1] ?? row.tone]}
													/>
												);
											})}
										</g>
									),
								)}
						<UsageChartSelectionMarker
							variant={variant}
							selectedDay={selectedDay}
							selectedIndex={selectedIndex}
							series={series}
							point={point}
							slot={slot}
							barWidth={barWidth}
						/>
					</svg>
					<UsageChartSelectionMarker
						variant={variant}
						selectedDay={selectedDay}
						selectedIndex={selectedIndex}
						series={series}
						point={point}
						slot={slot}
						barWidth={barWidth}
						overlay
					/>
					{focusDay !== null && (
						<button
							type="button"
							data-day={focusDay}
							aria-label={`${label}. ${formatDay(focusDay)}: ${format(dayTotal(focusIndex))}`}
							aria-describedby={instructionsId}
							aria-pressed={selectedDay === focusDay}
							onPointerMove={(event) => setHoverDay(days[indexAtPointer(event)]!)}
							onPointerLeave={() => setHoverDay(null)}
							onFocus={() => setHasFocus(true)}
							onBlur={() => setHasFocus(false)}
							onKeyDown={handleKeyDown}
							onClick={(event) => toggleDaySelection(event.detail === 0 ? focusIndex : indexAtPointer(event))}
							className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
						/>
					)}
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
