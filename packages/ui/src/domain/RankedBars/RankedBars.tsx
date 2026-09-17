import { type ReactNode, useState } from "react";
import { Button } from "../../primitives/Button";
import { cx } from "../../utils/cx";
import { type ChartTone, chartBgClass } from "../chartTones";

export type RankedBarRow = {
	key: string;
	label: string;
	// A second line under the label: a ticket title, a project path.
	detail?: ReactNode;
	value: number;
	// The formatted value, printed at the right.
	valueLabel: string;
	// The share of the whole, 0 to 1, printed after the value.
	share: number;
	tone: ChartTone;
	// A mark before the label, such as the icon of a model provider.
	icon?: ReactNode;
	// A sparse day series behind the bar, oldest first. Empty for none.
	spark?: readonly number[];
	// An IconButton at the end of the row, outside the select button: the
	// link that opens the ticket or the project of the row.
	action?: ReactNode;
};

export type RankedBarsProps = {
	// The accessible name of the list.
	label: string;
	rows: readonly RankedBarRow[];
	selected: string | null;
	onSelect: (key: string | null) => void;
	// How many rows show before the Show all button. Default 8.
	limit?: number;
	className?: string;
};

// A tiny bar series of the days, for the right of a row: it shows when the
// cost happened without a second chart.
function Spark({ values }: { values: readonly number[] }) {
	const top = Math.max(0, ...values);
	if (top <= 0) return null;
	const slot = 100 / values.length;
	return (
		<svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="h-4 w-20 shrink-0">
			{values.map((value, index) =>
				value > 0 ? (
					<rect
						// biome-ignore lint/suspicious/noArrayIndexKey: a day series never reorders.
						key={index}
						x={index * slot}
						y={100 - (value / top) * 100}
						width={slot * 0.8}
						height={(value / top) * 100}
						className="fill-fg-faint"
					/>
				) : null,
			)}
		</svg>
	);
}

// The ranked slices of a whole, largest first, each with a bar as long as
// its share of the largest. A pressed row is the selected slice. The list
// shows `limit` rows, then a Show all button reveals the rest.
export function RankedBars({ label, rows, selected, onSelect, limit = 8, className }: RankedBarsProps) {
	const [expanded, setExpanded] = useState(false);
	const max = rows[0]?.value ?? 0;
	const visible = expanded ? rows : rows.slice(0, limit);
	return (
		<div className={cx("flex flex-col gap-1", className)}>
			<ul aria-label={label} className="flex flex-col gap-1">
				{visible.map((row) => {
					const pressed = row.key === selected;
					return (
						<li key={row.key} className="flex items-center gap-1">
							<button
								type="button"
								aria-pressed={pressed}
								onClick={() => onSelect(pressed ? null : row.key)}
								className={cx(
									"grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 text-left transition-colors duration-hover ease-out",
									"focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
									pressed ? "bg-accent-soft" : "hover:bg-elevated",
								)}
							>
								<span className="flex min-w-0 items-center gap-2">
									{row.icon !== undefined && <span className="inline-flex shrink-0 text-fg-muted">{row.icon}</span>}
									<span className="truncate text-sm font-medium text-fg">{row.label}</span>
									{row.detail !== undefined && (
										<span className="min-w-0 truncate text-xs text-fg-muted">{row.detail}</span>
									)}
								</span>
								<span className="flex items-center gap-3">
									{row.spark && <Spark values={row.spark} />}
									<span className="w-20 text-right text-sm text-fg tabular">{row.valueLabel}</span>
									<span className="w-10 text-right text-xs text-fg-faint tabular">{Math.round(row.share * 100)}%</span>
								</span>
								<span aria-hidden="true" className="col-span-2 block h-1.5 w-full rounded-hairline bg-elevated">
									<span
										className={cx("block h-1.5 rounded-hairline", chartBgClass[row.tone])}
										style={{ width: `${max > 0 ? Math.max(1, (100 * row.value) / max) : 0}%` }}
									/>
								</span>
							</button>
							<span className="flex w-7 shrink-0 justify-center">{row.action}</span>
						</li>
					);
				})}
			</ul>
			{rows.length > limit && (
				<div className="flex justify-start px-2">
					<Button size="sm" variant="quiet" onClick={() => setExpanded((value) => !value)}>
						{expanded ? "Show fewer" : `Show all ${rows.length}`}
					</Button>
				</div>
			)}
		</div>
	);
}
