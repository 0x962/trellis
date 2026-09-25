import { Check } from "@phosphor-icons/react";
import { Tooltip } from "../../primitives/Tooltip";
import { cx } from "../../utils/cx";

export type PageCommentPinProps = {
	number: number;
	label: string;
	x: number;
	y: number;
	resolved: boolean;
	selected: boolean;
	onClick: () => void;
};

export function PageCommentPin({ number, label, x, y, resolved, selected, onClick }: PageCommentPinProps) {
	return (
		<Tooltip content={label}>
			<button
				type="button"
				aria-label={label}
				aria-pressed={selected}
				style={{ left: x, top: y }}
				className={cx(
					"pointer-events-auto absolute z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-medium tabular shadow-sm",
					"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
					"max-md:size-11",
					resolved
						? "border-fg-muted bg-surface text-fg-muted hover:bg-control-hover"
						: "border-accent bg-accent text-on-accent hover:brightness-105",
					selected && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
				)}
				onClick={onClick}
			>
				<span>{number}</span>
				{resolved && (
					<Check aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-surface" />
				)}
			</button>
		</Tooltip>
	);
}
