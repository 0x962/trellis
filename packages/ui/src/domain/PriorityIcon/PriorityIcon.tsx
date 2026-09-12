import { ExclamationMark } from "@phosphor-icons/react";
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
// the room. The mark is the Phosphor exclamation icon, not a text node: a picker option
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
				<ExclamationMark aria-hidden="true" weight="bold" className="size-3" />
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
