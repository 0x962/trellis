import { cx } from "../../utils/cx";

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export type PriorityIconProps = {
	priority: Priority;
	className?: string;
};

const filledBars: Record<Exclude<Priority, "urgent">, number> = { none: 0, low: 1, medium: 2, high: 3 };

const barHeights = ["h-1", "h-2", "h-3"];

// Three rising bars fill from the left as the priority rises. Urgent is a
// filled danger square with an exclamation mark, so it reads from across
// the room. The mark is a drawn path, not a text node: a picker option
// that holds the icon keeps its own label as its whole text.
export function PriorityIcon({ priority, className }: PriorityIconProps) {
	const label = `Priority: ${priority}`;
	if (priority === "urgent") {
		return (
			<span
				role="img"
				aria-label={label}
				className={cx(
					"inline-grid size-3.5 shrink-0 place-items-center rounded-sm bg-danger text-on-accent select-none",
					className,
				)}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
					<path d="M8 3.5v5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
					<circle cx="8" cy="12.3" r="1.4" fill="currentColor" />
				</svg>
			</span>
		);
	}
	const filled = filledBars[priority];
	return (
		<span role="img" aria-label={label} className={cx("inline-flex h-3 w-3.5 shrink-0 items-end gap-0.5", className)}>
			{barHeights.map((height, index) => (
				<i
					key={height}
					className={cx("block w-0.75 rounded-hairline", height, index < filled ? "bg-fg-muted" : "bg-border-strong")}
				/>
			))}
		</span>
	);
}
