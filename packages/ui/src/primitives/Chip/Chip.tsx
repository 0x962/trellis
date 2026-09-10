import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";

export type ChipProps = {
	// A lucide icon element or a StatusIcon, shown at 14 px before the label.
	icon?: ReactElement;
	label: string;
	// The word between the label and the value, such as "is" or "in".
	op?: string;
	value: string;
	// When set, the op is a button that flips the operator.
	onOpClick?: () => void;
	// When set, the value is a button that reopens the value picker.
	onValueClick?: () => void;
	// When set, a remove button follows the value.
	onRemove?: () => void;
	// The accessible name of the remove button. "Remove <label>" by default.
	removeLabel?: string;
	// Extra controls after the value, such as a scope toggle.
	children?: ReactNode;
	className?: string;
};

const partClass =
	"rounded-sm px-0.5 transition-colors duration-hover hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1";

// A filter chip: "Status is In Progress" with an optional remove button. The
// op and the value become buttons when their handlers are set, so a chip
// edits in place. A part's hit box is the chip's own 20 px height plus the
// bar's padding around the chip; the parts sit side by side and cannot grow.
export function Chip({
	icon,
	label,
	op = "is",
	value,
	onOpClick,
	onValueClick,
	onRemove,
	removeLabel,
	children,
	className,
}: ChipProps) {
	return (
		<span
			className={cx(
				"inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-border bg-surface pr-1.5 pl-1 text-xs whitespace-nowrap text-fg-muted",
				className,
			)}
		>
			{icon && (
				<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
					{icon}
				</span>
			)}
			<span className="font-medium text-fg">{label}</span>{" "}
			{onOpClick ? (
				<button type="button" onClick={onOpClick} className={cx("text-fg-faint", partClass)}>
					{op}
				</button>
			) : (
				<span className="text-fg-faint">{op}</span>
			)}{" "}
			{onValueClick ? (
				<button type="button" onClick={onValueClick} className={cx("font-medium text-fg", partClass)}>
					{value}
				</button>
			) : (
				<span className="font-medium text-fg">{value}</span>
			)}
			{children}
			{onRemove && (
				// The glyph box is 16 px. The hit-area layer around it reaches the
				// 28 px and 44 px minimums while the chip stays 20 px tall.
				<button
					type="button"
					aria-label={removeLabel ?? `Remove ${label}`}
					onClick={onRemove}
					className={cx(
						"-mr-0.5 inline-flex size-4 items-center justify-center rounded-sm text-fg-faint transition duration-hover hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1",
						hitArea.box16,
					)}
				>
					<X className="size-3" />
				</button>
			)}
		</span>
	);
}
