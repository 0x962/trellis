import { type KeyboardEvent, type MouseEvent, useId, useMemo, useState } from "react";
import { cx } from "../../utils/cx";
import { type ChartTone, chartFillClass, chartToneClass } from "../chartTones";
import { niceMax } from "./components/niceMax";
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
	integerScale?: boolean;
	variant?: "bar" | "line" | "grouped";
	appearance?: "default" | "overview";
	className?: string;
};

// The gridlines, top first, as the share of the top value each one marks.
const GRID_LINES = [1, 0.75, 0.5, 0.25, 0] as const;

const tickIndexes = (count: number) => {
	const target = count <= 7 ? 4 : count <= 31 ? 5 : 7;
	const tickCount = Math.min(count, target);
	if (tickCount <= 1) return count === 0 ? [] : [0];
	return Array.from({ length: tickCount }, (_, index) => Math.round((index * (count - 1)) / (tickCount - 1)));
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
	integerScale = false,
	variant = "bar",
	className,
	appearance = "default",
}: UsageChartProps) {
	const [hoverDay, setHoverDay] = useState<string | null>(null);
	const [hasFocus, setHasFocus] = useState(false);
	const [cursor, setCursor] = useState(() => ({ day: selectedDay ?? days[0] ?? null, index: 0 }));
	const instructionsId = useId();
	const count = days.length;
	const dayIndexByDay = useMemo(() => new Map(days.map((day, index) => [day, index])), [days]);
	const dayTotal = (index: number) => series.reduce((sum, row) => sum + (row.values[index] ?? 0), 0);
	const top = useMemo(() => {
		const values =
			variant === "grouped"
				? series.flatMap((row) => [...row.values])
				: days.map((_, index) => series.reduce((sum, row) => sum + (row.values[index] ?? 0), 0));
		const scaleMax = max ?? niceMax(Math.max(0, ...values));
		return integerScale ? Math.max(4, Math.ceil(scaleMax / 4) * 4) : scaleMax;
	}, [days, series, variant, max, integerScale]);
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
	const ticks = tickIndexes(count);
	// Gaps keep bars for adjacent days distinct.
	const slot = 100 / Math.max(1, count);
	const barWidth = slot * (appearance === "overview" ? 0.45 : 0.7);
	const point = (index: number, value: number) => ({
		x: count <= 1 ? 50 : (index / (count - 1)) * 100,
		y: 100 - (value / top) * 100,
	});
	const indexAtPointer = (event: MouseEvent<HTMLButtonElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect();
		return Math.min(count - 1, Math.max(0, Math.floor(((event.clientX - bounds.left) / bounds.width) * count)));
	};
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "Escape" && selectedDay !== null) {
			event.preventDefault();
			event.stopPropagation();
			onSelectDay(null);
			return;
		}
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
				Use Left and Right to inspect chart points. Use Home and End to move to the first or last point. Press Enter or
				Space to select or clear a point. Press Escape to clear the selected point.
			</span>
			<div className="flex min-w-0 gap-2">
				<div
					className={cx(
						"flex w-12 shrink-0 flex-col justify-between text-right text-xs tabular",
						appearance === "overview" ? "text-fg-muted" : "text-fg-faint",
					)}
				>
					{GRID_LINES.map((share) => (
						<span key={share} className="leading-none">
							{format(top * share)}
						</span>
					))}
				</div>
				<div className={cx("relative min-w-0 flex-1", appearance === "overview" ? "h-44" : "h-48")}>
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
						{variant !== "line"
							? days.map((day, index) => {
									let stacked = 0;
									const dim = appearance === "default" && captionIndex >= 0 && captionIndex !== index;
									return (
										<g key={day} data-day={day} className={cx(dim && "opacity-60")}>
											{series.map((row, seriesIndex) => {
												const value = row.values[index] ?? 0;
												if (value <= 0) return null;
												const height = (value / top) * 100;
												stacked += height;
												return (
													<rect
														key={row.key}
														data-series={row.key}
														x={
															index * slot +
															(slot - barWidth) / 2 +
															(variant === "grouped" ? (seriesIndex * barWidth) / series.length : 0)
														}
														y={100 - (variant === "grouped" ? height : stacked)}
														width={variant === "grouped" ? (barWidth / series.length) * 0.85 : barWidth}
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
							onFocus={() => {
								setHasFocus(true);
								if (selectedIndex >= 0) setCursor({ day: selectedDay, index: selectedIndex });
							}}
							onBlur={() => setHasFocus(false)}
							onKeyDown={handleKeyDown}
							onClick={(event) => toggleDaySelection(event.detail === 0 ? focusIndex : indexAtPointer(event))}
							className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
						/>
					)}
				</div>
			</div>
			<div className={cx("flex pl-14 text-xs tabular", appearance === "overview" ? "text-fg-muted" : "text-fg-faint")}>
				{ticks.map((index, position) => (
					<span
						key={index}
						data-chart-tick={days[index]}
						className={cx(
							"flex-1",
							position === 0 ? "text-left" : position === ticks.length - 1 ? "text-right" : "text-center",
							position !== 0 &&
								position !== ticks.length - 1 &&
								position !== Math.floor(ticks.length / 2) &&
								"max-sm:hidden",
						)}
					>
						{formatDay(days[index]!)}
					</span>
				))}
			</div>
			<figcaption
				className={cx(
					"flex flex-wrap items-center gap-x-4 gap-y-1 pl-14 text-sm",
					appearance === "overview" ? "min-h-16" : "min-h-5",
				)}
			>
				<div role="status" aria-atomic="true" className="font-medium text-fg tabular">
					{captionIndex >= 0 && (
						<>
							{formatDay(days[captionIndex]!)} · {format(dayTotal(captionIndex))}
						</>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
				</div>
			</figcaption>
		</figure>
	);
}
