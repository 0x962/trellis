import { X } from "lucide-react";
import type { ReactElement } from "react";
import { cx } from "../../utils/cx";

export type ChipProps = {
	// A lucide icon element or a StatusIcon, shown at 14 px before the label.
	icon?: ReactElement;
	label: string;
	// The word between the label and the value, such as "is" or "in".
	op?: string;
	value: string;
	// When set, a remove button follows the value.
	onRemove?: () => void;
	className?: string;
};

// A filter chip: "Status is In Progress" with an optional remove button.
export function Chip({ icon, label, op = "is", value, onRemove, className }: ChipProps) {
	return (
		<span
			className={cx(
				"inline-flex h-5 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface pr-1.5 pl-1 text-xs whitespace-nowrap text-fg-muted",
				className,
			)}
		>
			{icon && (
				<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
					{icon}
				</span>
			)}
			<span className="font-medium text-fg">{label}</span>
			<span className="text-fg-faint">{op}</span>
			<span className="font-medium text-fg">{value}</span>
			{onRemove && (
				<button
					type="button"
					aria-label={`Remove ${label}`}
					onClick={onRemove}
					className="-mr-0.5 inline-flex size-4 items-center justify-center rounded-sm text-fg-faint transition duration-hover hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
				>
					<X className="size-3" />
				</button>
			)}
		</span>
	);
}
