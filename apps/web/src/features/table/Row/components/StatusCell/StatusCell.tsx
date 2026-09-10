import type { StatusSummary } from "@trellis/api";
import { StatusIcon } from "@trellis/ui";
import type { RefObject } from "react";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { cellButtonClass } from "../../cellButtonClass";

export type StatusCellProps = {
	status: StatusSummary;
	// The statuses of the scope. The picker lists them.
	statuses: readonly StatusSummary[];
	// The share of sub-tickets that are done, for a started status.
	progress?: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (status: StatusSummary) => void;
	finalFocus: RefObject<HTMLElement | null>;
};

// The status icon and name, which open the picker on click or on `s`.
export function StatusCell({ status, statuses, progress, open, onOpenChange, onPick, finalFocus }: StatusCellProps) {
	return (
		<StatusPicker
			statuses={statuses}
			value={status.id}
			open={open}
			onOpenChange={onOpenChange}
			onPick={onPick}
			finalFocus={finalFocus}
			trigger={
				<button type="button" aria-label={`Status: ${status.name}`} className={cellButtonClass}>
					<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} progress={progress} />
					<span className="truncate text-sm text-fg-muted">{status.name}</span>
				</button>
			}
		/>
	);
}
