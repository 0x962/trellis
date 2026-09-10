import type { Priority } from "@trellis/api";
import { PriorityIcon } from "@trellis/ui";
import type { RefObject } from "react";
import { PriorityPicker } from "../../../../pickers/PriorityPicker";
import { cellButtonClass } from "../../cellButtonClass";

export type PriorityCellProps = {
	priority: Priority;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (priority: Priority) => void;
	finalFocus: RefObject<HTMLElement | null>;
};

// The priority mark, which opens the picker on click or on `p`.
export function PriorityCell({ priority, open, onOpenChange, onPick, finalFocus }: PriorityCellProps) {
	return (
		<PriorityPicker
			value={priority}
			open={open}
			onOpenChange={onOpenChange}
			onPick={onPick}
			finalFocus={finalFocus}
			trigger={
				<button type="button" aria-label="Change priority" className={cellButtonClass}>
					<PriorityIcon priority={priority} />
				</button>
			}
		/>
	);
}
