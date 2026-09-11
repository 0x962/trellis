import type { Priority } from "@trellis/api";
import { cx, PriorityIcon } from "@trellis/ui";
import type { RefObject } from "react";
import { PriorityPicker } from "../../../../pickers/PriorityPicker";
import { cellButtonClass } from "../../cellButtonClass";

export type PriorityCellProps = {
	priority: Priority;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (priority: Priority) => void;
	finalFocus: RefObject<HTMLElement | null>;
	// Extra classes for the trigger. The phone row draws it 44 px on a
	// coarse pointer, which a 36 px desktop row has no room for.
	className?: string;
};

// The priority mark, which opens the picker on click or on `p`.
export function PriorityCell({ priority, open, onOpenChange, onPick, finalFocus, className }: PriorityCellProps) {
	return (
		<PriorityPicker
			value={priority}
			open={open}
			onOpenChange={onOpenChange}
			onPick={onPick}
			finalFocus={finalFocus}
			trigger={
				<button type="button" aria-label="Change priority" className={cx(cellButtonClass, "justify-center", className)}>
					<PriorityIcon priority={priority} />
				</button>
			}
		/>
	);
}
