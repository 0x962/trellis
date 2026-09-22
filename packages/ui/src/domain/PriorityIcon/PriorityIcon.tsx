import { ExclamationMark } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export type PriorityIconProps = {
	priority: Priority;
	tooltip?: boolean;
	focusable?: boolean;
	decorative?: boolean;
	className?: string;
};

const filledBars: Record<Exclude<Priority, "urgent">, number> = { none: 0, low: 1, medium: 2, high: 3 };

const barHeights = ["h-1.5", "h-2.5", "h-3.5"];

// Three rising bars fill from the left as the priority rises. Urgent is a
// filled danger square with an exclamation mark, so it reads from across
// the room. The mark is the Phosphor exclamation icon, not a text node: a picker option
// that holds the icon keeps its own label as its whole text.
export function PriorityIcon({
	priority,
	tooltip = true,
	focusable = true,
	decorative = false,
	className,
}: PriorityIconProps) {
	const label = `Priority: ${priority}`;
	const withTooltip = (icon: ReactElement) => (tooltip ? <Tooltip content={label}>{icon}</Tooltip> : icon);
	const shared = decorative
		? { "aria-hidden": "true" as const }
		: { role: "img", "aria-label": label, tabIndex: tooltip && focusable ? 0 : undefined };
	if (priority === "urgent") {
		const icon = (
			<span
				{...shared}
				className={cx(
					"inline-grid size-4 shrink-0 place-items-center rounded-sm bg-danger text-on-accent select-none",
					className,
				)}
			>
				<ExclamationMark aria-hidden="true" weight="bold" className="size-3.5" />
			</span>
		);
		return decorative ? icon : withTooltip(icon);
	}
	const filled = filledBars[priority];
	const icon = (
		<span {...shared} className={cx("inline-flex h-4 w-4 shrink-0 items-end gap-0.5", className)}>
			{barHeights.map((height, index) => (
				<i
					key={height}
					className={cx("block w-0.75 rounded-hairline", height, index < filled ? "bg-fg-muted" : "bg-border-strong")}
				/>
			))}
		</span>
	);
	return decorative ? icon : withTooltip(icon);
}
